import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { readOpenBrainStats } from '../../server/openbrain'

export const Route = createFileRoute('/api/openbrain-stats')({
  server: { handlers: { GET: async ({ request }) => {
    if (!isAuthenticated(request)) return json({ error: 'Unauthorized' }, { status: 401 })
    try {
      const metadata = await readOpenBrainStats()
      return json({ configured: true, available: metadata.status !== 'unavailable', ...metadata },
        { headers: { 'Cache-Control': 'no-store' } })
    } catch {
      return json({ configured: true, available: false, status: 'unavailable',
        reason: 'AIA Brain metadata snapshot unavailable. No legacy fallback.' },
        { headers: { 'Cache-Control': 'no-store' } })
    }
  } } },
})
