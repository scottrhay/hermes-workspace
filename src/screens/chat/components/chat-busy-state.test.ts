import { describe, expect, it } from 'vitest'

import {
  getAssistantWaitLabel,
  getComposerPrimaryAction,
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
})
