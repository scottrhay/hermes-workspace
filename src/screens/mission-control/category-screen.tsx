import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { isMarketing, isTraining } from '@/lib/mission-categories'

type TelegramWorkstream = {
  sessionId: string
  sessionKey: string
  groupName: string
  chatId: string
  topicId: string
  title: string
  updatedAt: number
  messageCount: number
  isActive: boolean
  preview: string
}

export type CategoryScreenProps = {
  category: 'marketing' | 'training'
  title: string
  description: string
}

function relativeTime(ms: number): string {
  const now = Date.now()
  const diffMs = now - ms
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffDay >= 1) return `${diffDay}d ago`
  if (diffHour >= 1) return `${diffHour}h ago`
  if (diffMin >= 1) return `${diffMin}m ago`
  return 'just now'
}

function filterWorkstreams(
  workstreams: TelegramWorkstream[],
  category: 'marketing' | 'training',
): TelegramWorkstream[] {
  const fn = category === 'marketing' ? isMarketing : isTraining
  return workstreams.filter(fn)
}

export function CategoryScreen({ category, title, description }: CategoryScreenProps) {
  const query = useQuery<{ workstreams?: TelegramWorkstream[]; ok?: boolean }>({
    queryKey: ['telegram-workstreams'],
    queryFn: async () => {
      const res = await fetch('/api/telegram-workstreams')
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      return res.json() as Promise<{ workstreams?: TelegramWorkstream[]; ok?: boolean }>
    },
    staleTime: 30_000,
    retry: 1,
  })

  const filtered = query.isSuccess
    ? filterWorkstreams(query.data?.workstreams ?? [], category)
    : []

  return (
    <div
      data-testid="category-screen"
      className="min-h-screen overflow-y-auto bg-[var(--theme-bg,#0f0f10)] px-4 py-6 sm:px-6 lg:px-8"
    >
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/"
          className="flex items-center text-sm text-[var(--theme-muted)] transition-colors hover:text-[var(--theme-text)]"
          aria-label="Back to Mission Control"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span className="ml-1">Back</span>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[var(--theme-text)] sm:text-2xl">{title}</h1>
          <p className="text-sm text-[var(--theme-muted)]">{description}</p>
        </div>
      </div>

      {/* Content */}
      {query.isPending && (
        <div
          data-testid="category-loading"
          className="space-y-3"
          aria-label="Loading workstreams"
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)]"
            />
          ))}
        </div>
      )}

      {query.isError && (
        <div
          data-testid="category-error"
          className="rounded-xl border border-red-800/40 bg-red-950/20 p-5 text-sm text-red-400"
        >
          Could not load Telegram workstreams. Check that the gateway is running.
        </div>
      )}

      {query.isSuccess && filtered.length === 0 && (
        <div
          data-testid="category-empty"
          className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 text-center text-sm text-[var(--theme-muted)]"
        >
          No {category === 'marketing' ? 'Marketing' : 'Training'} workstreams found. Check the
          keyword map in src/lib/mission-categories.ts or wait for new workstreams.
        </div>
      )}

      {query.isSuccess && filtered.length > 0 && (
        <ul data-testid="category-populated" className="space-y-3">
          {filtered.map((ws) => (
            <li
              key={ws.sessionId}
              className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* Title + group row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--theme-text)] text-sm leading-snug">
                      {ws.title}
                    </span>
                    <span className="text-xs text-[var(--theme-muted)]">{ws.groupName}</span>
                  </div>

                  {/* Preview */}
                  {ws.preview && (
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--theme-muted)]">
                      {ws.preview}
                    </p>
                  )}

                  {/* Meta row */}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--theme-muted)]">
                    {/* Active/inactive dot */}
                    <span className="flex items-center gap-1">
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          ws.isActive ? 'bg-emerald-400' : 'bg-[var(--theme-muted)]'
                        }`}
                        aria-hidden="true"
                      />
                      {ws.isActive ? 'Active' : 'Inactive'}
                    </span>

                    {/* Message count */}
                    <span>{ws.messageCount} msg{ws.messageCount === 1 ? '' : 's'}</span>

                    {/* Updated at */}
                    <span>{relativeTime(ws.updatedAt)}</span>
                  </div>
                </div>

                {/* Open chat link */}
                <Link
                  to="/chat/$sessionKey"
                  params={{ sessionKey: ws.sessionKey }}
                  className="shrink-0 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-1.5 text-xs text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-text)]"
                >
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

