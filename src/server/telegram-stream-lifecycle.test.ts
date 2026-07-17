import { afterEach, describe, expect, it, vi } from 'vitest'
import { acquireTelegramSendLock } from './telegram-send-lock'
import { createTelegramStreamLifecycle } from './telegram-stream-lifecycle'
import { createTelegramStreamTerminalHandlers } from './telegram-stream-terminal'

afterEach(() => {
  vi.useRealTimers()
})

function createHarness(key: string) {
  const release = acquireTelegramSendLock(key)
  if (!release) throw new Error(`Failed to acquire test lock: ${key}`)
  const abortUpstream = vi.fn()
  const closeController = vi.fn()
  const lifecycle = createTelegramStreamLifecycle({
    releaseLock: release,
    abortUpstream,
    closeController,
  })
  const persistStatus = vi.fn(() => Promise.resolve())
  const terminal = createTelegramStreamTerminalHandlers({
    closeStream: () => lifecycle.close(),
    persistStatus,
  })
  return { lifecycle, terminal, persistStatus, abortUpstream, closeController }
}

describe('Telegram stream lifecycle', () => {
  it.each([
    ['completion', 'complete', 'complete'],
    ['cancellation', 'cancel', 'handoff'],
    ['upstream error', 'upstreamError', 'error'],
    ['normal upstream end', 'upstreamEnd', 'complete'],
  ] as const)(
    'persists terminal state, releases the lock, and closes resources after %s',
    async (path, terminalName, expectedStatus) => {
      const key = `stable-${path}`
      const { terminal, persistStatus, abortUpstream, closeController } =
        createHarness(key)

      const firstTerminal = terminal[terminalName]()
      const secondTerminal = terminal[terminalName]()
      expect(secondTerminal).toBe(firstTerminal)
      await firstTerminal

      expect(persistStatus).toHaveBeenCalledOnce()
      expect(persistStatus).toHaveBeenCalledWith(expectedStatus, undefined)
      expect(abortUpstream).toHaveBeenCalledOnce()
      expect(closeController).toHaveBeenCalledOnce()
      const nextRelease = acquireTelegramSendLock(key)
      expect(nextRelease).toBeTypeOf('function')
      nextRelease?.()
    },
  )

  it('fires a watchdog, releases the lock, and clears both heartbeat timers', async () => {
    vi.useFakeTimers()
    const key = 'stable-timeout'
    const { lifecycle, terminal, persistStatus } = createHarness(key)
    const transportHeartbeat = vi.fn()
    const activityHeartbeat = vi.fn()

    lifecycle.setInterval(transportHeartbeat, 10)
    lifecycle.setInterval(activityHeartbeat, 10)
    lifecycle.setTimeout(() => terminal.timeout(), 25)

    await vi.advanceTimersByTimeAsync(25)
    const ticksAtClose =
      transportHeartbeat.mock.calls.length + activityHeartbeat.mock.calls.length
    await vi.advanceTimersByTimeAsync(100)

    expect(lifecycle.isClosed()).toBe(true)
    expect(persistStatus).toHaveBeenCalledWith('error', 'Stream timeout')
    expect(
      transportHeartbeat.mock.calls.length + activityHeartbeat.mock.calls.length,
    ).toBe(ticksAtClose)
    const nextRelease = acquireTelegramSendLock(key)
    expect(nextRelease).toBeTypeOf('function')
    nextRelease?.()
  })

  it('does not close resources until terminal persistence completes', async () => {
    const key = 'stable-persistence-order'
    const release = acquireTelegramSendLock(key)
    if (!release) throw new Error(`Failed to acquire test lock: ${key}`)
    const closeController = vi.fn()
    const lifecycle = createTelegramStreamLifecycle({
      releaseLock: release,
      abortUpstream: vi.fn(),
      closeController,
    })
    let resolvePersistence: (() => void) | undefined
    const persistence = new Promise<void>((resolve) => {
      resolvePersistence = resolve
    })
    const terminal = createTelegramStreamTerminalHandlers({
      closeStream: () => lifecycle.close(),
      persistStatus: () => persistence,
    })

    const terminalDone = terminal.upstreamError('safe error')
    expect(closeController).not.toHaveBeenCalled()
    expect(acquireTelegramSendLock(key)).toBeNull()

    resolvePersistence?.()
    await terminalDone

    expect(closeController).toHaveBeenCalledOnce()
    const nextRelease = acquireTelegramSendLock(key)
    expect(nextRelease).toBeTypeOf('function')
    nextRelease?.()
  })
})
