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

  it('paginates Telegram session admission within the dashboard limit', async () => {
    const source = await readFile(routeUrl, 'utf8')

    expect(source).not.toContain('listSessions(1_000')
    expect(source).toContain('listTelegramSessionsForAdmission()')
    expect(source).toContain('listSessions(TELEGRAM_SESSION_PAGE_SIZE, offset')
  })

  it('admits an atomically bound Mission Control-created Telegram topic', async () => {
    const source = await readFile(routeUrl, 'utf8')

    expect(source).toContain('findTopicBySessionKey')
    expect(source).toContain('isAuthorizedTelegramSessionPair')
    expect(source).toContain('authorizedDashboardPair || authorizedCreatedPair')
  })

  it('resolves the addressed topic through the sticky directory', async () => {
    // A topic created seconds ago is addressable before any session row
    // mentions it, and a known topic stays addressable when a page omits it.
    const source = await readFile(routeUrl, 'utf8')

    expect(source).toContain('readTopicDirectory()')
    expect(source).toContain('{ directory }')
  })
})
