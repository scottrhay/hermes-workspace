import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { fetchWorkItems } from '@/screens/tasks/tasks-screen'
import { STATUS_ORDER, statusLabel } from '@/screens/tasks/oe-types'

/**
 * Compact live preview of the OpenEngine task board for the dashboard
 * rail. Mirrors the header language of the full `/tasks` screen
 * (`src/screens/tasks/tasks-screen.tsx`) — same "OpenEngine task board"
 * subtitle, refresh affordance, and canonical-dashboard link — but only
 * shows per-status counts. The full interactive board (filters, cards,
 * detail panel) stays at `/tasks`; this widget is a dashboard-sized
 * summary that links there, not a replacement for it.
 */

const QUERY_KEY = ['dashboard', 'openengine-tasks'] as const
const REFRESH_MS = 30_000

const STATUS_TONE: Record<string, string> = {
  in_progress: 'var(--theme-accent)',
  blocked: 'var(--theme-danger)',
  human_hold: 'var(--theme-accent-secondary, var(--theme-accent))',
  review_requested: 'var(--theme-warning)',
  changes_requested: 'var(--theme-warning)',
  ready: 'var(--theme-success)',
  cancelled: 'var(--theme-muted)',
  closed: 'var(--theme-muted)',
}

function statusTone(status: string): string {
  return STATUS_TONE[status] ?? 'var(--theme-muted)'
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section
      className="relative flex w-full flex-col gap-2 overflow-hidden rounded-xl border px-3 py-2.5"
      style={{
        background:
          'linear-gradient(150deg, color-mix(in srgb, var(--theme-card) 96%, transparent), color-mix(in srgb, var(--theme-card) 92%, transparent))',
        borderColor: 'var(--theme-border)',
      }}
      aria-label="Tasks"
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

export function TasksCard() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, dataUpdatedAt, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchWorkItems,
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: 1,
    retryDelay: 0,
  })

  const lastUpdated = useMemo(
    () => (dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null),
    [dataUpdatedAt],
  )

  const columns = useMemo(() => {
    if (!data) return []
    const grouped = new Map<string, number>()
    for (const item of data) {
      grouped.set(item.status, (grouped.get(item.status) ?? 0) + 1)
    }
    const known = STATUS_ORDER.filter((status) => grouped.has(status)).map((status) => ({
      status,
      count: grouped.get(status)!,
    }))
    const extra = [...grouped.keys()]
      .filter((status) => !STATUS_ORDER.includes(status))
      .sort()
      .map((status) => ({ status, count: grouped.get(status)! }))
    return [...known, ...extra]
  }, [data])

  const header = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h3
          className="text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: 'var(--theme-text)' }}
        >
          Tasks
        </h3>
        <p className="truncate text-[10px]" style={{ color: 'var(--theme-muted)' }}>
          OpenEngine task board
          {lastUpdated && !isLoading ? ` · ${lastUpdated}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => void queryClient.invalidateQueries({ queryKey: QUERY_KEY })}
          disabled={isFetching}
          aria-label="Refresh tasks"
          title="Refresh"
          className="rounded p-1 text-[11px] leading-none transition-colors disabled:opacity-50"
          style={{ color: 'var(--theme-muted)' }}
        >
          {isFetching ? '…' : '↺'}
        </button>
        {/* "Open canonical dashboard": this compact card is a summary —
            the existing full board still lives at /tasks, so that's what
            this points to rather than an external URL. */}
        <Link
          to="/tasks"
          className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors hover:bg-[var(--theme-card)]/80"
          style={{ color: 'var(--theme-muted)' }}
          title="Open canonical dashboard"
        >
          Open canonical ↗
        </Link>
      </div>
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

  if (isError) {
    return (
      <Shell>
        {header}
        <p className="text-[11px] leading-4" style={{ color: 'var(--theme-muted)' }}>
          OpenEngine is unavailable.{' '}
          <Link to="/tasks" className="underline" style={{ color: 'var(--theme-accent)' }}>
            Open canonical dashboard ↗
          </Link>
        </p>
      </Shell>
    )
  }

  if (columns.length === 0) {
    return (
      <Shell>
        {header}
        <p className="text-[11px]" style={{ color: 'var(--theme-muted)' }}>
          No work items found.
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      {header}
      <Link to="/tasks" className="flex flex-wrap gap-1.5" aria-label="Open Tasks board">
        {columns.map(({ status, count }) => (
          <span
            key={status}
            data-testid="tasks-card-column"
            className="inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:bg-[var(--theme-card)]/80"
            style={{
              borderColor: `color-mix(in srgb, ${statusTone(status)} 35%, var(--theme-border))`,
              color: 'var(--theme-muted)',
            }}
          >
            <span style={{ color: 'var(--theme-text)' }}>{count}</span>
            {statusLabel(status)}
          </span>
        ))}
      </Link>
    </Shell>
  )
}
