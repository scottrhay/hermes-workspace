import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAuthenticated } from '../../server/auth-middleware'
import { rateLimit, rateLimitResponse } from '../../server/rate-limit'
import { Route } from './openengine-probe'

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

vi.mock('../../server/rate-limit', () => ({
  rateLimit: vi.fn(),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  rateLimitResponse: vi.fn().mockReturnValue(new Response('Too Many Requests', { status: 429 })),
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

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(isAuthenticated).mockReturnValue(true)
  vi.mocked(rateLimit).mockReturnValue(true)
  vi.mocked(rateLimitResponse).mockReturnValue(new Response('Too Many Requests', { status: 429 }))
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GET /api/openengine-probe', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)

    const response = await handler({
      request: new Request('http://localhost/api/openengine-probe'),
    })

    expect(response.status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue(false)

    const response = await handler({
      request: new Request('http://localhost/api/openengine-probe'),
    })

    expect(response.status).toBe(429)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns { reachable: true } when fetch succeeds', async () => {
    vi.mocked(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(null, { status: 200 }),
    )

    const response = await handler({
      request: new Request('http://localhost/api/openengine-probe'),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ reachable: true })
    expect(body.url).toBeDefined()
  })

  it('returns { reachable: false, reason: "unreachable within 5s" } when fetch throws', async () => {
    vi.mocked(fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('ECONNREFUSED'),
    )

    const response = await handler({
      request: new Request('http://localhost/api/openengine-probe'),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      reachable: false,
      reason: 'unreachable within 5s',
    })
    expect(body.url).toBeDefined()
  })

  it('returns { reachable: false } when fetch times out (AbortError)', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    vi.mocked(fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(abortError)

    const response = await handler({
      request: new Request('http://localhost/api/openengine-probe'),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      reachable: false,
      reason: 'unreachable within 5s',
    })
  })
})

