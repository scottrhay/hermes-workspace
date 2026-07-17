type TerminalStatus = 'complete' | 'error' | 'handoff'

export function createTelegramStreamTerminalHandlers(options: {
  closeStream: () => void
  persistStatus: (
    status: TerminalStatus,
    errorMessage?: string,
  ) => void | Promise<unknown>
}) {
  let terminalPromise: Promise<void> | null = null
  const finish = (status: TerminalStatus, errorMessage?: string) => {
    if (terminalPromise) return terminalPromise
    terminalPromise = Promise.resolve(options.persistStatus(status, errorMessage))
      .catch(() => undefined)
      .then(() => options.closeStream())
    return terminalPromise
  }

  return {
    complete: () => finish('complete'),
    cancel: () => finish('handoff'),
    timeout: (errorMessage = 'Stream timeout') =>
      finish('error', errorMessage),
    upstreamError: (errorMessage?: string) =>
      finish('error', errorMessage),
    upstreamEnd: () => finish('complete'),
  }
}
