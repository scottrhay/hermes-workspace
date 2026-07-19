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

export function hasConfirmedAssistantActivity({
  transportStreaming,
  isCompacting,
  hasRunningTool,
  liveToolActivityCount,
  lifecycleEventCount,
}: {
  transportStreaming: boolean
  isCompacting: boolean
  hasRunningTool: boolean
  liveToolActivityCount: number
  lifecycleEventCount: number
}): boolean {
  // Opening the browser transport means only "submitted/requesting". It is not
  // evidence that Hermes has started processing the canonical turn.
  void transportStreaming
  return (
    isCompacting ||
    hasRunningTool ||
    liveToolActivityCount > 0 ||
    lifecycleEventCount > 0
  )
}
