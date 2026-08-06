import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  type ResearchKind,
  searchResearch,
} from '../../../server/research-browser'

export const Route = createFileRoute('/api/research/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const query = url.searchParams.get('q') || ''
        const kindParam = url.searchParams.get('kind')
        const kind: ResearchKind | undefined =
          kindParam === 'curated' || kindParam === 'feed' ? kindParam : undefined

        try {
          return json({ results: searchResearch(query, { kind }) })
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to search research',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
