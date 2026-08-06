import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { getClientIp, rateLimit, rateLimitResponse } from '../../server/rate-limit'

export const Route = createFileRoute('/api/openengine-probe')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const ip = getClientIp(request)
        if (!rateLimit(`openengine-probe:${ip}`, 10, 60_000)) {
          return rateLimitResponse()
        }

        const base =
          process.env.OPENENGINE_URL ??
          process.env.VITE_OPENENGINE_URL ??
          'http://127.0.0.1:5227'

        // Probe only the origin (no path)
        let origin: string
        try {
          origin = new URL(base).origin
        } catch {
          origin = base
        }

        try {
          await fetch(origin, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000),
          })
          return json({ reachable: true, url: origin })
        } catch {
          return json({
            reachable: false,
            url: origin,
            reason: 'unreachable within 5s',
          })
        }
      },
    },
  },
})

