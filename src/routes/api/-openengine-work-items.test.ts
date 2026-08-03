import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAuthenticated } from '../../server/auth-middleware'
import { rateLimit, rateLimitResponse, getClientIp } from '../../server/rate-limit'

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

vi.mock('../../server/rate-limit', () => ({
  rateLimit: vi.fn(),
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
  rateLimitResponse: vi.fn().mockReturnValue(new Response('Too Many Requests', { status: 429 })),
}))

vi.mock('../../server/openengine-client', () => ({
  fetchOEWorkItems: vi.fn(),
  OEUnavailableError: class OEUnavailableError extends Error {
    statusCode?: number
    constructor(msg: string, code?: number) {
      super(msg)
      this.name = 'OEUnavailableError'
      this.statusCode = code
    }
  },
  OEConfigError: class OEConfigError extends Error {
    constructor(msg: string) {
      super(msg)
      this.name = 'OEConfigError'
    }
  },
}))

import { fetchOEWorkItems, OEUnavailableError, OEConfigError } from '../../server/openengine-client'

type RouteShape = {
  options: {
    server: {
      handlers: {
        GET: (ctx: { request: Request }) => Promise<Response>
      }
    }
  }
}

// Lazy import to allow mocks to be wired first
async function loadHandler() {
  const mod = await import('./openengine-work-items')
  return (mod.Route as unknown as RouteShape).options.server.handlers.GET
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(isAuthenticated).mockReturnValue(true)
  vi.mocked(rateLimit).mockReturnValue(true)
  vi.mocked(getClientIp).mockReturnValue('127.0.0.1')
  vi.mocked(rateLimitResponse).mockReturnValue(new Response('Too Many Requests', { status: 429 }))
})

afterEach(() => {
  vi.resetModules()
})

describe('GET /api/openengine-work-items', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
    const handler = await loadHandler()

    const res = await handler({ request: new Request('http://localhost/api/openengine-work-items') })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/unauthorized/i)
    expect(fetchOEWorkItems).not.toHaveBeenCalled()
  })

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue(false)
    const handler = await loadHandler()

    const res = await handler({ request: new Request('http://localhost/api/openengine-work-items') })
    expect(res.status).toBe(429)
    expect(fetchOEWorkItems).not.toHaveBeenCalled()
  })

  it('returns ok:true with items on success', async () => {
    const mockItems = [
      {
        id: 'item-1',
        title: 'Do the thing',
        status: 'in_progress',
        priority: 'P0',
        owner: 'default',
        type: 'feature',
        tier: 'full_spec',
        summary: null,
        workflowMode: 'governed',
        createdBy: 'default',
        requiresDeployment: false,
        requiresOpenBrainLog: false,
        forge: { red: 0, yellow: 0, green: 0, notApplicable: 0 },
        updatedAt: '2026-08-03T10:00:00Z',
        latestReceipt: null,
      },
    ]
    vi.mocked(fetchOEWorkItems).mockResolvedValue(mockItems as any)
    const handler = await loadHandler()

    const res = await handler({ request: new Request('http://localhost/api/openengine-work-items') })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.items).toHaveLength(1)
    expect(body.items[0].id).toBe('item-1')
  })

  it('returns 503 with ok:false when OE is unavailable', async () => {
    vi.mocked(fetchOEWorkItems).mockRejectedValue(
      new OEUnavailableError('OpenEngine unreachable'),
    )
    const handler = await loadHandler()

    const res = await handler({ request: new Request('http://localhost/api/openengine-work-items') })
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/unavailable/i)
  })

  it('returns 503 with ok:false when OE is misconfigured', async () => {
    vi.mocked(fetchOEWorkItems).mockRejectedValue(
      new OEConfigError('OPENENGINE_URL must be loopback'),
    )
    const handler = await loadHandler()

    const res = await handler({ request: new Request('http://localhost/api/openengine-work-items') })
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/not configured/i)
  })

  it('returns 500 on unexpected error', async () => {
    vi.mocked(fetchOEWorkItems).mockRejectedValue(new Error('Something exploded'))
    const handler = await loadHandler()

    const res = await handler({ request: new Request('http://localhost/api/openengine-work-items') })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })
})
