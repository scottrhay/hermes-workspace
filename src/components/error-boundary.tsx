import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ErrorBoundaryProps = {
  children: ReactNode
  className?: string
  title?: string
  description?: string
}

type ErrorBoundaryState = {
  error: Error | null
  recovering: boolean
}

const STALE_RUNTIME_RECOVERY_KEY = 'hermes-stale-runtime-recovery-at'
const STALE_RUNTIME_RECOVERY_TTL_MS = 30_000

type RecoveryStorage = Pick<Storage, 'getItem' | 'setItem'>

export function isRecoverableStaleRuntimeError(error: unknown): boolean {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const lower = message.toLowerCase()
  const isReactDomMismatch =
    message.includes('Failed to execute') &&
    (message.includes('insertBefore') || message.includes('removeChild')) &&
    message.includes('not a child of this node')
  const isStaleBuildAsset =
    lower.includes('failed to fetch dynamically imported module') ||
    lower.includes('error loading dynamically imported module') ||
    lower.includes('importing a module script failed') ||
    lower.includes('chunkloaderror') ||
    (lower.includes('loading chunk') && lower.includes('failed'))

  return isReactDomMismatch || isStaleBuildAsset
}

function claimRuntimeRecovery(
  storage: RecoveryStorage,
  now = Date.now(),
): boolean {
  try {
    const previous = Number(
      storage.getItem(STALE_RUNTIME_RECOVERY_KEY) ?? '0',
    )
    const alreadyRetried = Number.isFinite(previous)
      ? now - previous < STALE_RUNTIME_RECOVERY_TTL_MS
      : false
    if (alreadyRetried) return false

    storage.setItem(STALE_RUNTIME_RECOVERY_KEY, String(now))
    return true
  } catch {
    return false
  }
}

export function claimStaleRuntimeRecovery(
  error: unknown,
  storage: RecoveryStorage,
  now = Date.now(),
): boolean {
  return (
    isRecoverableStaleRuntimeError(error) &&
    claimRuntimeRecovery(storage, now)
  )
}

export function handleVitePreloadError(
  event: Pick<Event, 'preventDefault'>,
  storage: RecoveryStorage,
  reload: () => void,
  now = Date.now(),
): boolean {
  if (!claimRuntimeRecovery(storage, now)) return false

  event.preventDefault()
  reload()
  return true
}

export async function clearStaleRuntimeCaches(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.update()))
    }
  } catch {
    // Best-effort only. Recovery should not fail because SW APIs are blocked.
  }
  try {
    if ('caches' in window) {
      const keys = await window.caches.keys()
      await Promise.all(keys.map((key) => window.caches.delete(key)))
    }
  } catch {
    // Best-effort only.
  }
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    error: null,
    recovering: false,
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, recovering: false }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI error', error, errorInfo)

    if (
      typeof window === 'undefined' ||
      !claimStaleRuntimeRecovery(error, window.sessionStorage)
    ) {
      return
    }

    this.setState({ recovering: true })
    void clearStaleRuntimeCaches().finally(() => {
      window.location.reload()
    })
  }

  reloadPage() {
    if (typeof window === 'undefined') return
    window.location.reload()
  }

  render() {
    const error = this.state.error
    if (!error) return this.props.children

    const title = this.props.title ?? 'Something went wrong'
    const description = this.state.recovering
      ? 'Recovering from a stale DOM/runtime mismatch. The page will reload automatically.'
      : (this.props.description ??
        'The chat encountered an unexpected issue. Reload to try again.')

    return (
      <div
        className={cn(
          'flex h-full min-h-0 items-center justify-center bg-primary-50 p-6',
          this.props.className,
        )}
      >
        <div className="w-full max-w-md rounded-xl border border-primary-200 bg-primary-100 p-6 text-center shadow-sm">
          <h2 className="text-balance text-xl font-medium text-primary-900">
            {title}
          </h2>
          <p className="mt-2 text-pretty text-sm text-primary-700">
            {description}
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded bg-red-50 p-2 text-left text-[10px] text-red-800">
            {error.message}
            {'\n'}
            {error.stack?.split('\n').slice(0, 5).join('\n')}
          </pre>
          <div className="mt-5 flex justify-center">
            <Button onClick={() => this.reloadPage()}>Reload</Button>
          </div>
        </div>
      </div>
    )
  }
}
