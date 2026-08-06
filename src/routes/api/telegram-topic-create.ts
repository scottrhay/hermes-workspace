import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  createSession,
  deleteSession,
  ensureGatewayProbed,
  getGatewayCapabilities,
  listSessions,
} from '../../server/claude-api'
import {
  forgetTopic,
  readTopicDirectory,
  rememberTopics,
} from '../../server/telegram-topic-directory'
import { confirmTopicNameFromTelegram } from '../../server/telegram-topic-names'
import { telegramSessionKey } from '../../server/telegram-topic-key'
import {
  createTelegramForumTopic,
  deleteTelegramForumTopic,
} from '../../server/telegram-forum-topics'
import {
  getTelegramOwnerUserId,
  normalizeTelegramWorkstreams,
} from '../../server/telegram-workstreams'

const PAGE_SIZE = 100
const MAX_SESSIONS = 1_000

async function listTelegramSessions() {
  const sessions: Awaited<ReturnType<typeof listSessions>> = []
  for (let offset = 0; offset < MAX_SESSIONS; offset += PAGE_SIZE) {
    const page = await listSessions(PAGE_SIZE, offset, {
      source: 'telegram',
      order: 'recent',
    })
    sessions.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return sessions
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export const Route = createFileRoute('/api/telegram-topic-create')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
        if (!contentType.startsWith('application/json')) {
          return json(
            { ok: false, error: 'Content-Type must be application/json' },
            { status: 415 },
          )
        }

        const body = (await request.json().catch(() => null)) as
          | Record<string, unknown>
          | null
        const chatId = clean(body?.chatId)
        const requestedGroupName = clean(body?.groupName)
        const name = clean(body?.name)
        if (!chatId || !requestedGroupName || !name) {
          return json(
            { ok: false, error: 'chatId, groupName, and name are required' },
            { status: 400 },
          )
        }
        if (name.length > 128) {
          return json(
            { ok: false, error: 'Topic name must be 128 characters or fewer' },
            { status: 400 },
          )
        }

        const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
        if (!token) {
          return json(
            { ok: false, error: 'Telegram topic creation is unavailable' },
            { status: 503 },
          )
        }

        try {
          await ensureGatewayProbed()
          const capabilities = getGatewayCapabilities()
          if (!capabilities.sessions || !capabilities.dashboard.available) {
            return json(
              { ok: false, error: 'Hermes session creation is unavailable' },
              { status: 503 },
            )
          }
          const sessions = await listTelegramSessions()
          const directory = readTopicDirectory()
          // General counts here: a group is known if we have seen any of its
          // topics, and a forum whose only activity is General is still a
          // group the owner can open a new topic in.
          const authorizedGroup = normalizeTelegramWorkstreams(
            sessions,
            getTelegramOwnerUserId(),
            {},
            { directory, includeGeneral: true },
          ).find((workstream) => workstream.chatId === chatId)
          if (!authorizedGroup) {
            return json(
              { ok: false, error: 'Telegram group was not found' },
              { status: 404 },
            )
          }
          const groupName = authorizedGroup.groupName || requestedGroupName
          const telegramTopic = await createTelegramForumTopic(chatId, name, token)
          let sessionId = ''
          try {
            const session = await createSession({ title: telegramTopic.title })
            sessionId = clean(session.id)
            if (!sessionId) throw new Error('Hermes did not return a session ID')
            const createdAt = Date.now()
            const binding = {
              chatId,
              groupName,
              topicId: telegramTopic.topicId,
              title: telegramTopic.title,
              sessionId,
              sessionKey: telegramSessionKey(chatId, telegramTopic.topicId),
              createdAt,
            }
            rememberTopics([{ ...binding, observedAt: createdAt }])
            // Telegram accepted this name, so record it as confirmed rather
            // than as a local override that could mask a later rename there.
            confirmTopicNameFromTelegram(
              chatId,
              telegramTopic.topicId,
              telegramTopic.title,
              createdAt,
            )
            return json({ ok: true, topic: binding }, { status: 201 })
          } catch (error) {
            if (sessionId) {
              await deleteSession(sessionId).catch(() => undefined)
            }
            await deleteTelegramForumTopic(
              chatId,
              telegramTopic.topicId,
              token,
            ).catch(() => false)
            // The topic is gone from Telegram, so this is the explicit delete
            // that is allowed to remove it from the directory.
            forgetTopic(chatId, telegramTopic.topicId)
            console.error('[telegram-topic-create] Binding failed', error)
            return json(
              {
                ok: false,
                error: 'Could not bind the new Telegram topic to Hermes',
              },
              { status: 502 },
            )
          }
        } catch (error) {
          console.error('[telegram-topic-create] Creation failed', error)
          const message = error instanceof Error ? error.message : ''
          return json(
            {
              ok: false,
              error: message || 'Telegram topic creation failed',
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
