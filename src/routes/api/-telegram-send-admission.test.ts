import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const routeUrl = new URL('./send-stream.ts', import.meta.url)

describe('Telegram browser-send admission', () => {
  it('does not treat dashboard is_active as a live cross-surface run', async () => {
    const source = await readFile(routeUrl, 'utf8')

    expect(source).not.toContain('isTelegramWorkstreamActive')
    expect(source).not.toContain('active on another surface')
    expect(source).toContain('acquireTelegramSendLock(gatewaySessionKey)')
  })
})
