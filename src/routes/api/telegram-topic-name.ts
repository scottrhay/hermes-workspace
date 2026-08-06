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
} from '../../server/telegram-workstreams'
import {
  confirmTopicNameFromTelegram,
  pushTelegramTopicRename,
  setTopicNameOverride,
} from '../../server/telegram-topic-names'
import { readTopicDirectory } from '../../server/telegram-topic-directory'
import { isAuthenticated } from '../../server/auth-middleware'

type RenameBody = {
  chatId?: unknown
  topicId?: unknown
  name?: unknown
  pushToTelegram?: unknown
}

const DASHBOARD_PAGE_SIZE = 100
const MAX_TELEGRAM_SESSIONS = 1_000

async function listTelegramSessionsForRename() {
  const sessions: Awaited<ReturnType<typeof listSessions>> = []
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

export const Route = createFileRoute('/api/telegram-topic-name')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        let body: RenameBody
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }

        const chatId = typeof body.chatId === 'string' ? body.chatId.trim() : ''
        const topicId = typeof body.topicId === 'string' ? body.topicId.trim() : ''
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        const pushToTelegram = body.pushToTelegram !== false

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

          const sessions = await listTelegramSessionsForRename()
          // A topic the directory already knows is renameable even if no
          // current session row mentions it — absence is not evidence that it
          // is gone.
          const workstreams = normalizeTelegramWorkstreams(
            sessions,
            getTelegramOwnerUserId(),
            {},
            { directory: readTopicDirectory(), includeGeneral: true },
          )
          const authorized = workstreams.some(
            (workstream) =>
              workstream.chatId === chatId && workstream.topicId === topicId,
          )
          if (!authorized) {
            return json({ ok: false, error: 'Topic not found' }, { status: 404 })
          }
        } catch (error) {
          console.error('[telegram-topic-name] Session lookup failed', error)
          return json(
            {
              ok: false,
              error: 'Telegram topic rename is temporarily unavailable.',
            },
            { status: 503 },
          )
        }

        try {
          setTopicNameOverride(chatId, topicId, name)
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : 'Invalid topic name',
            },
            { status: 400 },
          )
        }

        const push = await pushTelegramTopicRename(
          chatId,
          topicId,
          name,
          pushToTelegram,
        )
        // Telegram now holds this name, so promote the record from a local
        // fallback to a confirmed one. If the push failed the record stays
        // local and any name Telegram reports later will take precedence.
        if (push.status === 'renamed') {
          confirmTopicNameFromTelegram(chatId, topicId, name)
        }
        return json({
          ok: true,
          telegram: push.status,
          ...('telegramError' in push
            ? { telegramError: push.telegramError }
            : {}),
        })
      },
    },
  },
})
