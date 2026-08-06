import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { listResearchItems } from '../../../server/research-browser'

export const Route = createFileRoute('/api/research/list')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const refresh = url.searchParams.get('refresh') === '1'

        try {
          return json(listResearchItems({ refresh }))
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to list research items',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
