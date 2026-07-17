const activeTelegramBrowserSends = new Set<string>()

export function acquireTelegramSendLock(
  sessionKey: string,
): (() => void) | null {
  const key = sessionKey.trim()
  if (!key || activeTelegramBrowserSends.has(key)) return null

  activeTelegramBrowserSends.add(key)
  let released = false
  return () => {
    if (released) return
    released = true
    activeTelegramBrowserSends.delete(key)
  }
}
