/**
 * OpenBrain telemetry for the dashboard card.
 *
 * Reports `configured: false` (not an error) when OPENBRAIN_DB_URL is unset,
 * and `available: false` when OpenBrain is configured but unreachable, so the
 * card can render a placeholder instead of the browser logging failures.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  isOpenBrainConfigured,
  readOpenBrainStats,
} from '../../server/openbrain'

export const Route = createFileRoute('/api/openbrain-stats')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!isOpenBrainConfigured()) {
          return json({
            configured: false,
            available: false,
            reason:
              'OPENBRAIN_DB_URL is not set. Point it at OpenBrain’s Postgres using the read-only role to enable this panel.',
          })
        }

        try {
          const stats = await readOpenBrainStats()
          return json({ configured: true, available: true, ...stats })
        } catch (err) {
          // Unreachable OpenBrain is expected (laptop offline, container down)
          // and must not surface as a 500 the browser logs on every load.
          return json({
            configured: true,
            available: false,
            reason:
              err instanceof Error
                ? `OpenBrain is unreachable: ${err.message}`
                : 'OpenBrain is unreachable.',
          })
        }
      },
    },
  },
})
