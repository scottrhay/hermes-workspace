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
  pushTelegramTopicRename,
  setTopicNameOverride,
} from '../../server/telegram-topic-names'
import { isAuthenticated } from '../../server/auth-middleware'

type RenameBody = {
  chatId?: unknown
  topicId?: unknown
  name?: unknown
  pushToTelegram?: unknown
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

          const sessions = await listSessions(1_000, 0, {
            order: 'recent',
            source: 'telegram',
          })
          const workstreams = normalizeTelegramWorkstreams(
            sessions,
            getTelegramOwnerUserId(),
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
