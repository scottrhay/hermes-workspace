import { describe, expect, it } from 'vitest'

import {
  getAssistantDetailLabel,
  getAssistantWaitLabel,
  getComposerPrimaryAction,
  hasConfirmedAssistantActivity,
} from './chat-busy-state'

describe('chat busy state', () => {
  it('keeps Stop available while busy until the user drafts a follow-up', () => {
    expect(getComposerPrimaryAction({ busy: true, hasDraft: false })).toBe('stop')
  })

  it('offers Send for a drafted follow-up while the conversation is busy', () => {
    expect(getComposerPrimaryAction({ busy: true, hasDraft: true })).toBe('send')
  })

  it('labels an accepted but inactive turn as waiting', () => {
    expect(getAssistantWaitLabel({ active: false })).toBe('Waiting for Ariel…')
  })

  it('labels a turn as working only after activity begins', () => {
    expect(getAssistantWaitLabel({ active: true })).toBe('Ariel is working…')
  })

  it('does not treat transport startup alone as confirmed assistant activity', () => {
    expect(
      hasConfirmedAssistantActivity({
        transportStreaming: true,
        isCompacting: false,
        hasRunningTool: false,
        liveToolActivityCount: 0,
        lifecycleEventCount: 0,
      }),
    ).toBe(false)
  })

  it('confirms assistant activity from a real lifecycle event', () => {
    expect(
      hasConfirmedAssistantActivity({
        transportStreaming: false,
        isCompacting: false,
        hasRunningTool: false,
        liveToolActivityCount: 0,
        lifecycleEventCount: 1,
      }),
    ).toBe(true)
  })

  it('keeps the detail line truthful while the turn is only waiting', () => {
    expect(
      getAssistantDetailLabel({ active: false, heartbeat: 'Working…' }),
    ).toBe('Waiting…')
  })

  it('uses heartbeat detail only after activity is confirmed', () => {
    expect(
      getAssistantDetailLabel({ active: true, heartbeat: 'Using browser' }),
    ).toBe('Using browser')
  })
})
