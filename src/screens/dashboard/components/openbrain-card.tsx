import { useQuery } from '@tanstack/react-query'

/**
 * OpenBrain telemetry card.
 *
 * OpenBrain is the durable memory system behind every AIA workstream. This
 * reads /api/openbrain-stats, which queries OpenBrain's Postgres over a
 * read-only role rather than running its dashboard as a second service.
 *
 * The endpoint reports missing configuration and an unreachable database as
 * data (`configured` / `available`) rather than HTTP errors, so this card
 * renders an explanatory placeholder instead of disappearing or logging
 * console noise on every dashboard load.
 */

export type OpenBrainStatsResponse = {
  configured: boolean
  available: boolean
  reason?: string
  counts?: {
    contextItems: number
    decisions: number
    projects: number
    clients: number
    memoryEntries: number
    routing: number
  }
  recentMemory?: Array<{
    id: number
    scope: string | null
    category: string | null
    content: string
    importance: number | null
  }>
  activeProjects?: Array<{
    id: number
    name: string
    business: string | null
    priority: string | null
  }>
}

const REFRESH_MS = 60_000

export function formatCount(value: number): string {
  return value.toLocaleString()
}

/** Importance is 1-10; 7+ is the threshold OpenBrain treats as significant. */
export function isKeyMemory(importance: number | null): boolean {
  return (importance ?? 0) >= 7
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div
        className="font-mono text-sm font-semibold tabular-nums"
        style={{ color: 'var(--theme-text)' }}
      >
        {formatCount(value)}
      </div>
      <div
        className="truncate text-[9px] uppercase tracking-[0.14em]"
        style={{ color: 'var(--theme-muted)' }}
      >
        {label}
      </div>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="relative flex w-full flex-col gap-2 overflow-hidden rounded-xl border px-3 py-2.5"
      style={{
        background:
          'linear-gradient(150deg, color-mix(in srgb, var(--theme-card) 96%, transparent), color-mix(in srgb, var(--theme-card) 92%, transparent))',
        borderColor: 'var(--theme-border)',
      }}
      aria-label="OpenBrain"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background:
            'linear-gradient(90deg, var(--theme-accent), color-mix(in srgb, var(--theme-accent) 40%, transparent), transparent)',
        }}
      />
      {children}
    </section>
  )
}

export function OpenBrainCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['openbrain-stats'],
    queryFn: async (): Promise<OpenBrainStatsResponse> => {
      const res = await fetch('/api/openbrain-stats')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS,
    retry: false,
  })

  const header = (
    <div className="flex items-center justify-between gap-2">
      <h3
        className="text-[10px] font-semibold uppercase tracking-[0.18em]"
        style={{ color: 'var(--theme-text)' }}
      >
        OpenBrain
      </h3>
      <span
        className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.15em]"
        style={{ color: 'var(--theme-muted)' }}
      >
        <span
          className="size-1.5 rounded-full"
          style={{
            background: data?.available
              ? 'var(--theme-success, #22c55e)'
              : 'var(--theme-muted)',
          }}
        />
        {isLoading ? 'checking' : data?.available ? 'connected' : 'offline'}
      </span>
    </div>
  )

  if (isLoading) {
    return (
      <Shell>
        {header}
        <div
          className="h-16 animate-pulse rounded-lg"
          style={{ background: 'var(--theme-card2)' }}
        />
      </Shell>
    )
  }

  if (!data?.available) {
    return (
      <Shell>
        {header}
        <p className="text-[11px] leading-4" style={{ color: 'var(--theme-muted)' }}>
          {data?.reason ?? 'OpenBrain telemetry is unavailable.'}
        </p>
      </Shell>
    )
  }

  const counts = data.counts
  const recent = data.recentMemory ?? []
  const projects = data.activeProjects ?? []

  return (
    <Shell>
      {header}

      {counts ? (
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Memories" value={counts.memoryEntries} />
          <Stat label="Decisions" value={counts.decisions} />
          <Stat label="Projects" value={counts.projects} />
          <Stat label="Clients" value={counts.clients} />
        </div>
      ) : null}

      {recent.length > 0 ? (
        <div className="min-w-0">
          <div
            className="mb-1 text-[9px] uppercase tracking-[0.14em]"
            style={{ color: 'var(--theme-muted)' }}
          >
            Recent memory
          </div>
          <ul className="space-y-1">
            {recent.slice(0, 3).map((entry) => (
              <li key={entry.id} className="flex min-w-0 items-start gap-1.5">
                <span
                  className="mt-1 size-1 shrink-0 rounded-full"
                  style={{
                    background: isKeyMemory(entry.importance)
                      ? 'var(--theme-accent)'
                      : 'var(--theme-muted)',
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-[11px]" style={{ color: 'var(--theme-text)' }}>
                  <span style={{ color: 'var(--theme-muted)' }}>
                    {entry.scope ? `${entry.scope} · ` : ''}
                    {entry.category ? `${entry.category} · ` : ''}
                  </span>
                  {entry.content}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {projects.length > 0 ? (
        <div className="min-w-0">
          <div
            className="mb-1 text-[9px] uppercase tracking-[0.14em]"
            style={{ color: 'var(--theme-muted)' }}
          >
            Active projects
          </div>
          <ul className="space-y-0.5">
            {projects.slice(0, 3).map((project) => (
              <li
                key={project.id}
                className="flex min-w-0 items-center justify-between gap-2 text-[11px]"
              >
                <span className="min-w-0 truncate" style={{ color: 'var(--theme-text)' }}>
                  {project.name}
                </span>
                {project.priority ? (
                  <span
                    className="shrink-0 font-mono text-[9px]"
                    style={{ color: 'var(--theme-muted)' }}
                  >
                    {project.priority}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Shell>
  )
}
