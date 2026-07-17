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
import { isAuthenticated } from '../../server/auth-middleware'

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

          const sessions = await listSessions(1_000, 0, {
            order: 'recent',
            source: 'telegram',
          })
          return json({
            workstreams: normalizeTelegramWorkstreams(
              sessions,
              getTelegramOwnerUserId(),
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
