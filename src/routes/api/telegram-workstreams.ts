import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  ensureGatewayProbed,
  getGatewayCapabilities,
  listSessions,
} from '../../server/claude-api'
import {
  getTelegramOwnerUserId,
  normalizeTelegramWorkstreams,
  telegramTopicObservations,
} from '../../server/telegram-workstreams'
import { readTopicNameOverrides } from '../../server/telegram-topic-names'
import {
  readTopicDirectory,
  reconcileChatTopics,
  rememberTopics,
} from '../../server/telegram-topic-directory'
import {
  listForumTopicsForChats,
  toTopicObservations,
} from '../../server/telegram-forum-sync'
import { fetchTelegramGroupTitles } from '../../server/telegram-chat-info'
import { isAuthenticated } from '../../server/auth-middleware'

const DASHBOARD_PAGE_SIZE = 100
const MAX_TELEGRAM_SESSIONS = 1_000

async function listTelegramSessions() {
  const sessions = []
  for (
    let offset = 0;
    offset < MAX_TELEGRAM_SESSIONS;
    offset += DASHBOARD_PAGE_SIZE
  ) {
    const page = await listSessions(DASHBOARD_PAGE_SIZE, offset, {
      order: 'recent',
      source: 'telegram',
    })
    sessions.push(...page)
    if (page.length < DASHBOARD_PAGE_SIZE) break
  }
  return sessions
}

export const Route = createFileRoute('/api/telegram-workstreams')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          await ensureGatewayProbed()
          const capabilities = getGatewayCapabilities()
          if (!capabilities.sessions || !capabilities.dashboard.available) {
            return json(
              {
                ok: false,
                error: 'Telegram workstream metadata is unavailable',
              },
              { status: 503 },
            )
          }

          const sessions = await listTelegramSessions()
          const ownerUserId = getTelegramOwnerUserId()

          // Fold what these rows reveal into the sticky directory first, so a
          // topic stays listed even when a later page stops mentioning it.
          const sessionObservations = telegramTopicObservations(
            sessions,
            ownerUserId,
          )
          let directory = rememberTopics(sessionObservations)

          // Then, if a user session is configured, ask Telegram itself for
          // the real topic list. This is the only path that yields genuine
          // topic names and topics nobody has messaged yet — a bot token
          // cannot enumerate a forum at all.
          const chatIds = Array.from(
            new Set(
              [
                ...sessionObservations.map((entry) => entry.chatId),
                ...Array.from(directory.values(), (record) => record.chatId),
              ].filter(Boolean),
            ),
          )
          const syncedChats = await listForumTopicsForChats(chatIds)
          const liveTopicsByChat = new Map(
            Array.from(syncedChats, ([chatId, topics]) => [
              chatId,
              new Set(topics.map((topic) => topic.topicId)),
            ]),
          )
          for (const [chatId, topics] of syncedChats) {
            directory = rememberTopics(toTopicObservations(topics))
            // This listing covers the whole forum, so anything we still hold
            // for this chat that Telegram did not return has been deleted
            // there. This is the only place absence is treated as evidence.
            const removed = reconcileChatTopics(
              chatId,
              topics.map((topic) => topic.topicId),
            )
            if (removed.length > 0) {
              directory = readTopicDirectory()
              console.info(
                `[telegram-workstreams] Dropped ${removed.length} topic(s) deleted in ${chatId}: ${removed
                  .map((topic) => topic.topicId)
                  .join(', ')}`,
              )
            }
          }

          const groupNames = await fetchTelegramGroupTitles(
            Array.from(directory.values(), (record) => record.chatId),
          )

          return json({
            workstreams: normalizeTelegramWorkstreams(
              sessions,
              ownerUserId,
              readTopicNameOverrides(),
              { directory, groupNames, liveTopicsByChat },
            ),
          })
        } catch (error) {
          console.error('[telegram-workstreams] Session lookup failed', error)
          return json(
            {
              ok: false,
              error: 'Telegram workstreams are temporarily unavailable.',
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
