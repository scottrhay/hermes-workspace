import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { getClientIp, rateLimit, rateLimitResponse } from '../../server/rate-limit'
import {
  OEConfigError,
  OEUnavailableError,
  fetchOEWorkItemDetail,
} from '../../server/openengine-client'

export const Route = createFileRoute('/api/openengine-work-items/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const ip = getClientIp(request)
        if (!rateLimit(`oe-work-item-detail:${ip}`, 120, 60_000)) {
          return rateLimitResponse()
        }

        const id = (params as { id?: string }).id
        if (!id) {
          return json({ ok: false, error: 'Missing work-item id' }, { status: 400 })
        }

        try {
          const item = await fetchOEWorkItemDetail(id)
          return json({ ok: true, item })
        } catch (err) {
          if (err instanceof OEConfigError) {
            return json(
              { ok: false, error: 'OpenEngine is not configured', detail: err.message },
              { status: 503 },
            )
          }
          if (err instanceof OEUnavailableError) {
            const status = err.statusCode ?? 503
            return json(
              { ok: false, error: 'OpenEngine unavailable', detail: err.message },
              { status },
            )
          }
          return json(
            { ok: false, error: 'Unexpected error fetching work item' },
            { status: 500 },
          )
        }
      },
    },
  },
})
