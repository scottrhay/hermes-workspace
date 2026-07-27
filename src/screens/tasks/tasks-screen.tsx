import { useState } from 'react'

const DEFAULT_OPENENGINE_URL = 'http://127.0.0.1:5227/dashboard'

// OpenEngine (OE) dashboard — Scott's local task board. Overridable via
// VITE_OPENENGINE_URL for non-default ports/hosts.
export const OPENENGINE_DASHBOARD_URL =
  ((import.meta as any).env?.VITE_OPENENGINE_URL as string | undefined) ||
  DEFAULT_OPENENGINE_URL

export function TasksScreen() {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface text-ink">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--theme-border)] px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h1 className="text-xl font-medium text-ink">Tasks</h1>
          <p className="text-xs text-[var(--theme-muted)]">OpenEngine task board</p>
        </div>
        <a
          href={OPENENGINE_DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg border border-[var(--theme-border)] px-3 py-1.5 text-xs font-medium text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-text)]"
        >
          Open in new tab ↗
        </a>
      </header>

      {/* Embedded OpenEngine dashboard */}
      <div className="relative min-h-0 flex-1">
        {!failed && (
          <iframe
            title="OpenEngine Tasks"
            src={OPENENGINE_DASHBOARD_URL}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className="h-full w-full border-0"
          />
        )}

        {/* Loading veil until first load */}
        {!loaded && !failed && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface">
            <div className="text-xs font-medium text-[var(--theme-muted)]">
              Loading OpenEngine…
            </div>
          </div>
        )}

        {/* Fallback if the embed cannot load */}
        {failed && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium text-ink">OpenEngine isn&apos;t running</p>
            <p className="max-w-md text-xs text-[var(--theme-muted)]">
              Start it from AIA-OpenEngine (scripts/start-local.sh), then reload this page.
            </p>
            <a
              href={OPENENGINE_DASHBOARD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-[var(--theme-border)] px-3 py-1.5 text-xs font-medium text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-text)]"
            >
              Open in new tab ↗
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
