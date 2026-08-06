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
  fetchOEWorkItemDetail: vi.fn(),
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

import { fetchOEWorkItemDetail, OEUnavailableError, OEConfigError } from '../../server/openengine-client'

type RouteShape = {
  options: {
    server: {
      handlers: {
        GET: (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>
      }
    }
  }
}

async function loadHandler() {
  const mod = await import('./openengine-work-items.$id')
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

const MOCK_DETAIL = {
  id: 'abc-123',
  title: 'Test work item',
  status: 'in_progress',
  priority: 'P0',
  owner: 'default',
  type: 'feature',
  tier: 'full_spec',
  summary: 'A summary',
  workflowMode: 'governed',
  createdBy: 'default',
  requiresDeployment: true,
  requiresOpenBrainLog: false,
  forge: { red: 0, yellow: 0, green: 0, notApplicable: 0 },
  updatedAt: '2026-08-03T10:00:00Z',
  latestReceipt: null,
  createdAt: '2026-08-01T00:00:00Z',
  acceptanceCriteria: null,
  receipts: [],
  forgeDimensions: [],
}

describe('GET /api/openengine-work-items/$id', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
    const handler = await loadHandler()

    const res = await handler({
      request: new Request('http://localhost/api/openengine-work-items/abc-123'),
      params: { id: 'abc-123' },
    })
    expect(res.status).toBe(401)
    expect(fetchOEWorkItemDetail).not.toHaveBeenCalled()
  })

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue(false)
    const handler = await loadHandler()

    const res = await handler({
      request: new Request('http://localhost/api/openengine-work-items/abc-123'),
      params: { id: 'abc-123' },
    })
    expect(res.status).toBe(429)
    expect(fetchOEWorkItemDetail).not.toHaveBeenCalled()
  })

  it('returns 400 when id is missing', async () => {
    const handler = await loadHandler()

    const res = await handler({
      request: new Request('http://localhost/api/openengine-work-items/'),
      params: {},
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(fetchOEWorkItemDetail).not.toHaveBeenCalled()
  })

  it('returns 400 for a malformed id before calling OpenEngine', async () => {
    const handler = await loadHandler()

    const res = await handler({
      request: new Request('http://localhost/api/openengine-work-items/a.b'),
      params: { id: 'a.b' },
    })
    expect(res.status).toBe(400)
    expect(fetchOEWorkItemDetail).not.toHaveBeenCalled()
  })

  it('returns ok:true with item on success', async () => {
    vi.mocked(fetchOEWorkItemDetail).mockResolvedValue(MOCK_DETAIL as any)
    const handler = await loadHandler()

    const res = await handler({
      request: new Request('http://localhost/api/openengine-work-items/abc-123'),
      params: { id: 'abc-123' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.item.id).toBe('abc-123')
    expect(body.item.title).toBe('Test work item')
    expect(fetchOEWorkItemDetail).toHaveBeenCalledWith('abc-123')
  })

  it('returns 404 when OE returns 404', async () => {
    vi.mocked(fetchOEWorkItemDetail).mockRejectedValue(
      new OEUnavailableError('Work item abc-123 not found', 404),
    )
    const handler = await loadHandler()

    const res = await handler({
      request: new Request('http://localhost/api/openengine-work-items/abc-123'),
      params: { id: 'abc-123' },
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })

  it('returns 503 when OE is unavailable', async () => {
    vi.mocked(fetchOEWorkItemDetail).mockRejectedValue(
      new OEUnavailableError('OpenEngine unreachable'),
    )
    const handler = await loadHandler()

    const res = await handler({
      request: new Request('http://localhost/api/openengine-work-items/abc-123'),
      params: { id: 'abc-123' },
    })
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/unavailable/i)
  })

  it('returns 503 when OE config is bad', async () => {
    vi.mocked(fetchOEWorkItemDetail).mockRejectedValue(
      new OEConfigError('Non-loopback URL rejected'),
    )
    const handler = await loadHandler()

    const res = await handler({
      request: new Request('http://localhost/api/openengine-work-items/abc-123'),
      params: { id: 'abc-123' },
    })
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/not configured/i)
  })

  it('returns 500 on unexpected error', async () => {
    vi.mocked(fetchOEWorkItemDetail).mockRejectedValue(new Error('Unexpected crash'))
    const handler = await loadHandler()

    const res = await handler({
      request: new Request('http://localhost/api/openengine-work-items/abc-123'),
      params: { id: 'abc-123' },
    })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })
})
