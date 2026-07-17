import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  ensureGatewayProbed,
  getGatewayCapabilities,
  listSessions,
} from '../../server/claude-api'
import { Route } from './telegram-workstreams'

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

vi.mock('../../server/claude-api', () => ({
  ensureGatewayProbed: vi.fn(),
  getGatewayCapabilities: vi.fn(),
  listSessions: vi.fn(),
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
  vi.mocked(ensureGatewayProbed).mockResolvedValue({
    sessions: true,
    dashboard: { available: true },
  } as Awaited<ReturnType<typeof ensureGatewayProbed>>)
  vi.mocked(getGatewayCapabilities).mockReturnValue({
    sessions: true,
    dashboard: { available: true },
  } as ReturnType<typeof getGatewayCapabilities>)
})

describe('GET /api/telegram-workstreams', () => {
  it('requires Workspace authentication', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)

    const response = await handler({
      request: new Request('http://localhost/api/telegram-workstreams'),
    })

    expect(response.status).toBe(401)
    expect(listSessions).not.toHaveBeenCalled()
  })

  it('returns normalized Scott-owned Telegram workstreams', async () => {
    vi.mocked(listSessions).mockResolvedValue([
      {
        id: 'session-2246',
        source: 'telegram',
        user_id: '8304360654',
        session_key: 'telegram-key-2246',
        thread_id: '2246',
        display_name: 'Executive Administration',
        title: 'Mission Control integration',
        started_at: 100,
        last_active: 200,
        message_count: 12,
      },
    ] as any)

    const response = await handler({
      request: new Request('http://localhost/api/telegram-workstreams'),
    })

    expect(response.status).toBe(200)
    expect(listSessions).toHaveBeenCalledWith(1_000, 0, {
      order: 'recent',
      source: 'telegram',
    })
    expect(await response.json()).toEqual({
      workstreams: [
        {
          sessionId: 'session-2246',
          sessionKey: 'telegram-key-2246',
          groupName: 'Executive Administration',
          topicId: '2246',
          title: 'Mission Control integration',
          updatedAt: 200000,
          messageCount: 12,
        },
      ],
    })
  })

  it('returns a generic error when the dashboard session lookup fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(listSessions).mockRejectedValue(
      new Error('internal URL and upstream body must not leak'),
    )

    const response = await handler({
      request: new Request('http://localhost/api/telegram-workstreams'),
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Telegram workstreams are temporarily unavailable.',
    })
    consoleError.mockRestore()
  })

  it('returns a generic 503 when gateway probing fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(ensureGatewayProbed).mockRejectedValue(
      new Error('sensitive probe diagnostics'),
    )

    const response = await handler({
      request: new Request('http://localhost/api/telegram-workstreams'),
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Telegram workstreams are temporarily unavailable.',
    })
    expect(listSessions).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('returns 503 when rich dashboard session metadata is unavailable', async () => {
    vi.mocked(getGatewayCapabilities).mockReturnValue({
      sessions: true,
      dashboard: { available: false },
    } as ReturnType<typeof getGatewayCapabilities>)

    const response = await handler({
      request: new Request('http://localhost/api/telegram-workstreams'),
    })

    expect(response.status).toBe(503)
    expect(listSessions).not.toHaveBeenCalled()
  })
})
