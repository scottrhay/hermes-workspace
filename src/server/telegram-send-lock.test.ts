import { describe, expect, it } from 'vitest'
import { acquireTelegramSendLock } from './telegram-send-lock'

describe('Telegram browser send lock', () => {
  it('permits one browser send per stable workstream key and releases cleanly', () => {
    const release = acquireTelegramSendLock('stable-key')
    expect(release).toBeTypeOf('function')
    expect(acquireTelegramSendLock('stable-key')).toBeNull()

    release?.()

    const releaseAgain = acquireTelegramSendLock('stable-key')
    expect(releaseAgain).toBeTypeOf('function')
    releaseAgain?.()
  })

  it('does not lock empty keys', () => {
    expect(acquireTelegramSendLock('')).toBeNull()
  })
})
