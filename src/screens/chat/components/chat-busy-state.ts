export type ComposerPrimaryAction = 'send' | 'stop'

export function getComposerPrimaryAction({
  busy,
  hasDraft,
}: {
  busy: boolean
  hasDraft: boolean
}): ComposerPrimaryAction {
  return busy && !hasDraft ? 'stop' : 'send'
}

export function getAssistantWaitLabel({
  active,
}: {
  active: boolean
}): 'Waiting for Ariel…' | 'Ariel is working…' {
  return active ? 'Ariel is working…' : 'Waiting for Ariel…'
}
