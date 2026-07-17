import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('Telegram browser-send continuity wiring', () => {
  it('carries the selected stable session key from ChatScreen to the browser request', () => {
    const screen = source('src/screens/chat/chat-screen.tsx')
    const hook = source('src/screens/chat/hooks/use-streaming-message.ts')

    expect(screen).toContain('gatewaySessionKey')
    expect(screen).toContain('activeSession?.sessionKey')
    expect(hook).toContain('gatewaySessionKey?: string')
    expect(hook).toContain('gatewaySessionKey: params.gatewaySessionKey')
    expect(source('src/screens/chat/hooks/use-chat-sessions.ts')).toContain(
      'telegramWorkstreamsQuery',
    )
  })

  it('authorizes, serializes, and forwards the stable key only from the trusted server route', () => {
    const route = source('src/routes/api/send-stream.ts')

    expect(route).toContain('resolveAuthorizedTelegramWorkstream')
    expect(route).toContain('isAuthorizedTelegramSessionPair')
    expect(route).toContain('acquireTelegramSendLock')
    expect(route).toContain('status: 403')
    expect(route).toContain('status: 409')
    expect(route).toContain('status: 503')
    expect(route).toContain('currentWorkstream.sessionId')
    expect(route).toContain('gatewaySessionKey,')
  })

  it('uses one cleanup path that releases the Telegram lock and hides upstream diagnostics', () => {
    const route = source('src/routes/api/send-stream.ts')

    expect(route.match(/closeStream\s*=/g)).toHaveLength(1)
    expect(route).toContain('createTelegramStreamLifecycle')
    expect(route).toContain('createTelegramStreamTerminalHandlers')
    expect(route).toContain('releaseTelegramSendLock?.()')
    expect(route).toContain('streamController?.close()')
    expect(route.match(/streamLifecycle\.setInterval/g)).toHaveLength(2)
    expect(route.indexOf('streamLifecycle.setTimeout')).toBeLessThan(
      route.indexOf('await streamChat('),
    )
    expect(route).toContain('publicTelegramToolFailure')
    expect(route).toContain('publicTelegramToolEvent')
    expect(route).toContain('result: translated.result')
    expect(route).toContain('result: publicSynthetic.result')
    expect(route).toContain('streamTerminal.complete()')
    expect(route).toContain('streamTerminal.cancel()')
    expect(route).toContain('streamTerminal.timeout()')
    expect(route).toContain('streamTerminal.upstreamError(')
    expect(route).toContain('streamTerminal.upstreamEnd()')
    expect(route.match(/publicTelegramStreamFailure\(/g)).toHaveLength(
      3,
    )
  })
})
