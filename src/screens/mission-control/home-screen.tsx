import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

export type HomeStatus = {
  chats: { loading: boolean; count?: number; error?: boolean }
  openengine: { loading: boolean; reachable?: boolean; error?: boolean }
  marketing: { loading: boolean; count?: number; error?: boolean }
  training: { loading: boolean; count?: number; error?: boolean }
}

interface MissionControlHomeProps {
  status: HomeStatus
}

function StatusBadge({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs text-[var(--theme-muted)]">{children}</div>
  )
}

function CardStatus({
  loading,
  error,
  children,
}: {
  loading: boolean
  error?: boolean
  children: ReactNode
}) {
  if (loading) {
    return <StatusBadge>Loading…</StatusBadge>
  }
  if (error) {
    return <StatusBadge>Unavailable</StatusBadge>
  }
  return <StatusBadge>{children}</StatusBadge>
}

const SECONDARY_LINKS: { label: string; to: string }[] = [
  { label: 'Swarm', to: '/swarm' },
  { label: 'Memory', to: '/memory' },
  { label: 'Files', to: '/files' },
  { label: 'Settings', to: '/settings' },
  { label: 'MCP', to: '/mcp' },
  { label: 'Skills', to: '/skills' },
  { label: 'Terminal', to: '/terminal' },
]

export function MissionControlHome({ status }: MissionControlHomeProps) {
  return (
    <div
      data-testid="mission-control-home"
      className="min-h-screen overflow-y-auto bg-[var(--theme-bg,#0f0f10)] px-4 py-8 sm:px-6 lg:px-8"
    >
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--theme-text)] sm:text-3xl">
          AIA Mission Control
        </h1>
        <p className="mt-1 text-sm text-[var(--theme-muted)]">Operations Dashboard</p>
      </div>

      {/* Primary 5-card grid */}
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Card 1: Chats */}
        <Link
          to="/chat"
          data-testid="mc-card-chats"
          className="group block rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 transition-colors hover:border-[var(--theme-accent)]"
        >
          <div className="mb-3 text-2xl">💬</div>
          <h2 className="mb-1 text-base font-semibold text-[var(--theme-text)]">Chats</h2>
          <p className="mb-3 text-xs text-[var(--theme-muted)]">
            Telegram workstreams &amp; AI sessions
          </p>
          <CardStatus loading={status.chats.loading} error={status.chats.error}>
            {status.chats.count !== undefined
              ? `${status.chats.count} workstream${status.chats.count === 1 ? '' : 's'}`
              : 'Ready'}
          </CardStatus>
        </Link>

        {/* Card 2: OpenEngine Work */}
        <Link
          to="/tasks"
          data-testid="mc-card-openengine-work"
          className="group block rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 transition-colors hover:border-[var(--theme-accent)]"
        >
          <div className="mb-3 text-2xl">⚙️</div>
          <h2 className="mb-1 text-base font-semibold text-[var(--theme-text)]">
            OpenEngine Work
          </h2>
          <p className="mb-3 text-xs text-[var(--theme-muted)]">Task board &amp; work ledger</p>
          <CardStatus loading={status.openengine.loading} error={status.openengine.error}>
            {status.openengine.reachable === true
              ? 'OpenEngine online'
              : status.openengine.reachable === false
                ? 'OpenEngine offline'
                : 'Ready'}
          </CardStatus>
        </Link>

        {/* Card 3: Research Review */}
        <Link
          to="/research"
          data-testid="mc-card-research-review"
          className="group block rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 transition-colors hover:border-[var(--theme-accent)]"
        >
          <div className="mb-3 text-2xl">🔬</div>
          <h2 className="mb-1 text-base font-semibold text-[var(--theme-text)]">
            Research Review
          </h2>
          <p className="mb-3 text-xs text-[var(--theme-muted)]">Knowledge library &amp; feeds</p>
          <StatusBadge>Open to check status</StatusBadge>
        </Link>

        {/* Card 4: Marketing Ideas */}
        <Link
          to={'/marketing' as string}
          data-testid="mc-card-marketing-ideas"
          className="group block rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 transition-colors hover:border-[var(--theme-accent)]"
        >
          <div className="mb-3 text-2xl">📣</div>
          <h2 className="mb-1 text-base font-semibold text-[var(--theme-text)]">
            Marketing Ideas
          </h2>
          <p className="mb-3 text-xs text-[var(--theme-muted)]">Marketing workstreams</p>
          <CardStatus loading={status.marketing.loading} error={status.marketing.error}>
            {status.marketing.count !== undefined
              ? `${status.marketing.count} workstream${status.marketing.count === 1 ? '' : 's'}`
              : 'Ready'}
          </CardStatus>
        </Link>

        {/* Card 5: Training Courses */}
        <Link
          to={'/training' as string}
          data-testid="mc-card-training-courses"
          className="group block rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 transition-colors hover:border-[var(--theme-accent)]"
        >
          <div className="mb-3 text-2xl">🎓</div>
          <h2 className="mb-1 text-base font-semibold text-[var(--theme-text)]">
            Training Courses
          </h2>
          <p className="mb-3 text-xs text-[var(--theme-muted)]">Training workstreams</p>
          <CardStatus loading={status.training.loading} error={status.training.error}>
            {status.training.count !== undefined
              ? `${status.training.count} workstream${status.training.count === 1 ? '' : 's'}`
              : 'Ready'}
          </CardStatus>
        </Link>
      </div>

      {/* Secondary technical tools */}
      <div data-testid="secondary-nav">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--theme-muted)]">
          Technical Tools
        </h3>
        <div className="flex flex-wrap gap-2">
          {SECONDARY_LINKS.map(({ label, to }) => (
            <Link
              key={to}
              to={to as string}
              className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-1.5 text-xs text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-text)]"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

