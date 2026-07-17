import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTelegramStreamTerminalHandlers } from './telegram-stream-terminal'

const originalHermesHome = process.env.HERMES_HOME

let tempHome: string | null = null

beforeEach(() => {
  vi.resetModules()
  tempHome = mkdtempSync(join(tmpdir(), 'hermes-run-store-'))
  process.env.HERMES_HOME = tempHome
})

afterEach(() => {
  if (tempHome) rmSync(tempHome, { recursive: true, force: true })
  tempHome = null
  if (originalHermesHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = originalHermesHome
  vi.resetModules()
})

describe('run-store persistence', () => {
  it('preserves concurrent updates to the same run', async () => {
    const { addRunLifecycleEvent, createPersistedRun, getPersistedRun } =
      await import('./run-store')

    await createPersistedRun({ runId: 'run-1', sessionKey: 'session-1' })

    const events = Array.from({ length: 24 }, (_, index) => ({
      text: `event-${index}`,
      emoji: '',
      timestamp: index,
      isError: false,
    }))

    await Promise.all(
      events.map((event) => addRunLifecycleEvent('session-1', 'run-1', event)),
    )

    const stored = await getPersistedRun('session-1', 'run-1')
    expect(stored?.lifecycleEvents.map((event) => event.text).sort()).toEqual(
      events.map((event) => event.text).sort(),
    )
  })

  it('keeps a recoverable tool failure visible as an active run', async () => {
    const {
      createPersistedRun,
      getActiveRunForSession,
      getPersistedRun,
      upsertRunToolCall,
    } = await import('./run-store')
    const sessionKey = 'session-tool-recovery'
    const runId = 'run-tool-recovery'
    await createPersistedRun({ runId, sessionKey })

    await upsertRunToolCall(sessionKey, runId, {
      id: 'tool-1',
      name: 'example',
      phase: 'error',
      result: 'Tool failed. Retry shortly.',
    })

    const stored = await getPersistedRun(sessionKey, runId)
    expect(stored?.status).toBe('active')
    expect(stored?.errorMessage).toBeUndefined()
    expect(stored?.toolCalls[0]).toEqual(
      expect.objectContaining({
        phase: 'error',
        result: 'Tool failed. Retry shortly.',
      }),
    )
    expect((await getActiveRunForSession(sessionKey))?.runId).toBe(runId)
  })

  it.each([
    ['timeout', 'error'],
    ['upstreamError', 'error'],
    ['upstreamEnd', 'complete'],
  ] as const)(
    'removes a run from the active-run query after %s',
    async (terminalName, expectedStatus) => {
      const {
        appendRunText,
        createPersistedRun,
        getActiveRunForSession,
        getPersistedRun,
        markRunStatus,
      } = await import('./run-store')
      const sessionKey = `session-${terminalName}`
      const runId = `run-${terminalName}`
      await createPersistedRun({ runId, sessionKey })
      await appendRunText(sessionKey, runId, 'working')

      let statusWrite: Promise<unknown> = Promise.resolve()
      const terminal = createTelegramStreamTerminalHandlers({
        closeStream: vi.fn(),
        persistStatus(status, errorMessage) {
          statusWrite = markRunStatus(
            sessionKey,
            runId,
            status,
            errorMessage,
          )
        },
      })

      if (terminalName === 'timeout') terminal.timeout('Stream timeout')
      else if (terminalName === 'upstreamError') {
        terminal.upstreamError('Hermes response failed. Retry shortly.')
      } else terminal.upstreamEnd()
      await statusWrite

      expect((await getPersistedRun(sessionKey, runId))?.status).toBe(
        expectedStatus,
      )
      expect(await getActiveRunForSession(sessionKey)).toBeNull()
    },
  )
})
