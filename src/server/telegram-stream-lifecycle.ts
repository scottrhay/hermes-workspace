type TelegramStreamLifecycleOptions = {
  releaseLock: () => void
  abortUpstream: () => void
  closeController: () => void
}

export function createTelegramStreamLifecycle({
  releaseLock,
  abortUpstream,
  closeController,
}: TelegramStreamLifecycleOptions) {
  const intervals = new Set<ReturnType<typeof setInterval>>()
  const timeouts = new Set<ReturnType<typeof setTimeout>>()
  let closed = false

  return {
    setInterval(callback: () => void, delayMs: number) {
      const timer = setInterval(callback, delayMs)
      intervals.add(timer)
      return timer
    },
    setTimeout(callback: () => void, delayMs: number) {
      const timer = setTimeout(() => {
        timeouts.delete(timer)
        callback()
      }, delayMs)
      timeouts.add(timer)
      return timer
    },
    close() {
      if (closed) return
      closed = true
      for (const timer of intervals) clearInterval(timer)
      for (const timer of timeouts) clearTimeout(timer)
      intervals.clear()
      timeouts.clear()
      releaseLock()
      abortUpstream()
      closeController()
    },
    isClosed() {
      return closed
    },
  }
}
