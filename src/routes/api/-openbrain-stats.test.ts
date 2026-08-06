import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  isOpenBrainConfigured,
  readOpenBrainStats,
} from '../../server/openbrain'
import { Route } from './openbrain-stats'

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

vi.mock('../../server/openbrain', () => ({
  isOpenBrainConfigured: vi.fn(),
  readOpenBrainStats: vi.fn(),
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
const request = () => new Request('http://localhost/api/openbrain-stats')

const STATS = {
  counts: {
    contextItems: 42,
    decisions: 173,
    projects: 8,
    clients: 9,
    memoryEntries: 1295,
    routing: 4,
  },
  recentMemory: [],
  activeProjects: [],
}

describe('GET /api/openbrain-stats', () => {
  beforeEach(() => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    vi.mocked(isOpenBrainConfigured).mockReturnValue(true)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns stats when OpenBrain is reachable', async () => {
    vi.mocked(readOpenBrainStats).mockResolvedValue(STATS)

    const response = await handler({ request: request() })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      configured: true,
      available: true,
      ...STATS,
    })
  })

  it('reports unconfigured without touching the database', async () => {
    vi.mocked(isOpenBrainConfigured).mockReturnValue(false)

    const response = await handler({ request: request() })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.configured).toBe(false)
    expect(body.available).toBe(false)
    expect(readOpenBrainStats).not.toHaveBeenCalled()
  })

  it('reports an unreachable OpenBrain as a capability gap, not a 500', async () => {
    vi.mocked(readOpenBrainStats).mockRejectedValue(
      new Error('ECONNREFUSED 127.0.0.1:5433'),
    )

    const response = await handler({ request: request() })

    // A 500 here would log a console error on every dashboard load.
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.configured).toBe(true)
    expect(body.available).toBe(false)
    expect(body.reason).toMatch(/unreachable/i)
  })

  it('rejects unauthenticated callers', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)

    const response = await handler({ request: request() })

    expect(response.status).toBe(401)
    expect(readOpenBrainStats).not.toHaveBeenCalled()
  })
})
