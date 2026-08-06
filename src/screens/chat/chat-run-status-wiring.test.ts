import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { deriveChatRunStatus } from './components/chat-run-status'

const screenUrl = new URL('./chat-screen.tsx', import.meta.url)
const statusUrl = new URL('./components/chat-run-status.tsx', import.meta.url)

async function source(url: URL) {
  return readFile(url, 'utf8')
}

describe('Mission Control live run status wiring', () => {
  it('keeps a truthful run status immediately above the composer', async () => {
    const screen = await source(screenUrl)

    expect(screen).toContain("import { ChatRunStatus }")
    expect(screen).toContain('<ChatRunStatus')
    expect(screen).toContain('active={sending || waitingForResponse ||')
    expect(screen).toContain('activeToolCalls={activeToolCalls}')
    expect(screen).toContain('lifecycleEvents={realtimeLifecycleEvents}')
    expect(screen.lastIndexOf('<ChatRunStatus')).toBeLessThan(
      screen.lastIndexOf('<ChatComposer'),
    )
  })

  it('uses Mission Control theme tokens so status text stays legible', async () => {
    const statusSource = await source(statusUrl)

    expect(statusSource).toContain('bg-[var(--theme-card)]')
    expect(statusSource).toContain('text-[var(--theme-text)]')
    expect(statusSource).toContain('border-[var(--theme-border)]')
    expect(statusSource).toContain('max-md:fixed')
    expect(statusSource).toContain('var(--chat-composer-height')
  })

  it('keeps the activity toggle mounted while expanded so it can be closed', async () => {
    // The toggle used to render only when activityRows was non-empty, so an
    // emptying list mid-run removed the control and left the panel open with
    // no way to collapse it — reported from mobile.
    const statusSource = await source(statusUrl)

    expect(statusSource).toContain('activityRows.length > 0 || expanded')
    expect(statusSource).toContain("{expanded ? 'Hide' :")
  })

  it('keeps the run status visible for a run this tab started', async () => {
    // A Telegram workstream hands the stream off, which re-armed the stale
    // sessionStorage guard and hid the status on the sending device while a
    // freshly-opened second device still showed it.
    const screen = await source(screenUrl)

    expect(screen).toContain('startedRunThisMountRef')
    expect(screen).toContain('!startedRunThisMountRef.current.has(key)')
    expect(screen).toContain('startedRunThisMountRef.current.add(key)')
  })

  it('reports the current real lifecycle activity instead of a cosmetic timer', () => {
    const derive = deriveChatRunStatus as unknown as (
      input: Record<string, unknown>,
    ) => string

    expect(derive({ sending: true })).toBe('Sending message to Ariel…')
    expect(derive({ isCompacting: true })).toBe(
      'Ariel is organizing context…',
    )
    expect(
      derive({
        activeToolCalls: [
          { id: 'tool-1', name: 'read_file', phase: 'running' },
        ],
      }),
    ).toBe('Ariel is reading a file…')
    expect(
      derive({
        activeToolCalls: [
          { id: 'tool-2', name: 'browser_navigate', phase: 'calling' },
        ],
      }),
    ).toBe('Ariel is browsing the web…')
    expect(derive({ streamingText: 'Drafting' })).toBe(
      'Ariel is writing the response…',
    )
    expect(derive({ streamingThinking: 'Reasoning' })).toBe(
      'Ariel is thinking through your request…',
    )
  })
})
