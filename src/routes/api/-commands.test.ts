import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAuthenticated } from '../../server/auth-middleware'
import { gatewayFetch } from '../../server/gateway-capabilities'
import { Route } from './commands'

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

vi.mock('../../server/gateway-capabilities', () => ({
  gatewayFetch: vi.fn(),
}))

type RouteWithGet = typeof Route & {
  options: {
    server: {
      handlers: {
        GET: (ctx: { request: Request }) => Promise<Response>
      }
    }
  }
}

const handler = (Route as RouteWithGet).options.server.handlers.GET
const request = () => new Request('http://localhost/api/commands')

describe('GET /api/commands', () => {
  beforeEach(() => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns an empty command list when the gateway has no /v1/commands', async () => {
    // Gateways that predate (or omit) slash commands answer 404. That is a
    // missing capability, not an error: propagating it made the browser log a
    // console error on every chat page load.
    vi.mocked(gatewayFetch).mockResolvedValue(
      new Response('Not Found', { status: 404 }),
    )

    const response = await handler({ request: request() })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ commands: [] })
  })

  it('passes through the gateway command list when available', async () => {
    const commands = [{ command: '/status', description: 'Show status' }]
    vi.mocked(gatewayFetch).mockResolvedValue(
      new Response(JSON.stringify({ commands }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const response = await handler({ request: request() })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ commands })
  })

  it('still surfaces genuine gateway failures', async () => {
    vi.mocked(gatewayFetch).mockResolvedValue(
      new Response('Boom', { status: 502 }),
    )

    const response = await handler({ request: request() })

    expect(response.status).toBe(502)
  })

  it('rejects unauthenticated callers', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)

    const response = await handler({ request: request() })

    expect(response.status).toBe(401)
    expect(gatewayFetch).not.toHaveBeenCalled()
  })
})
