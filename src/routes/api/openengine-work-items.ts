import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { getClientIp, rateLimit, rateLimitResponse } from '../../server/rate-limit'
import {
  OEConfigError,
  OEUnavailableError,
  fetchOEWorkItems,
} from '../../server/openengine-client'

export const Route = createFileRoute('/api/openengine-work-items')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const ip = getClientIp(request)
        if (!rateLimit(`oe-work-items:${ip}`, 60, 60_000)) {
          return rateLimitResponse()
        }

        try {
          const items = await fetchOEWorkItems()
          return json({ ok: true, items })
        } catch (err) {
          if (err instanceof OEConfigError) {
            return json(
              { ok: false, error: 'OpenEngine is not configured', detail: err.message },
              { status: 503 },
            )
          }
          if (err instanceof OEUnavailableError) {
            const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 503
            return json(
              { ok: false, error: 'OpenEngine unavailable', detail: err.message },
              { status },
            )
          }
          return json(
            { ok: false, error: 'Unexpected error fetching work items' },
            { status: 500 },
          )
        }
      },
    },
  },
})
