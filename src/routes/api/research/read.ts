import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { readResearchItem } from '../../../server/research-browser'

export const Route = createFileRoute('/api/research/read')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const pathParam = url.searchParams.get('path') || ''

        try {
          const { item, content } = readResearchItem(pathParam)
          return json({ item, content })
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Failed to read research item'
          const status =
            /not allowed|outside the research root|required|traversal/i.test(
              message,
            )
              ? 400
              : /ENOENT|Not a file/i.test(message)
                ? 404
                : 500
          return json({ error: message }, { status })
        }
      },
    },
  },
})
