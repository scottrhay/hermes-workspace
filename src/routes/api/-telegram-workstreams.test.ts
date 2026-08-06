import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  ensureGatewayProbed,
  getGatewayCapabilities,
  listSessions,
} from '../../server/claude-api'
import { rememberTopics } from '../../server/telegram-topic-directory'
import { fetchTelegramGroupTitles } from '../../server/telegram-chat-info'
import { readTopicNameOverrides } from '../../server/telegram-topic-names'
import { Route } from './telegram-workstreams'
import type * as TelegramTopicNames from '../../server/telegram-topic-names'

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

vi.mock('../../server/claude-api', () => ({
  ensureGatewayProbed: vi.fn(),
  getGatewayCapabilities: vi.fn(),
  listSessions: vi.fn(),
}))

vi.mock('../../server/telegram-topic-directory', () => ({
  rememberTopics: vi.fn(() => new Map()),
}))

vi.mock('../../server/telegram-chat-info', () => ({
  fetchTelegramGroupTitles: vi.fn(() => Promise.resolve({})),
}))

vi.mock('../../server/telegram-forum-sync', () => ({
  listForumTopicsForChats: vi.fn(() => Promise.resolve([])),
  toTopicObservations: vi.fn(() => []),
}))

vi.mock('../../server/telegram-topic-names', async (importOriginal) => ({
  ...(await importOriginal<typeof TelegramTopicNames>()),
  readTopicNameOverrides: vi.fn(() => ({})),
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
  vi.mocked(rememberTopics).mockReturnValue(new Map())
  vi.mocked(fetchTelegramGroupTitles).mockResolvedValue({})
  vi.mocked(readTopicNameOverrides).mockReturnValue({})
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
        is_active: true,
        preview: 'Ariel is preparing the Mission Control update.',
      },
    ] as any)

    const response = await handler({
      request: new Request('http://localhost/api/telegram-workstreams'),
    })

    expect(response.status).toBe(200)
    expect(listSessions).toHaveBeenCalledWith(100, 0, {
      order: 'recent',
      source: 'telegram',
    })
    expect(await response.json()).toEqual({
      workstreams: [
        {
          sessionId: 'session-2246',
          sessionKey: 'telegram-key-2246',
          groupName: 'Executive Administration',
          chatId: '',
          topicId: '2246',
          title: 'Mission Control integration',
          updatedAt: 200000,
          messageCount: 12,
          isActive: true,
          preview: 'Ariel is preparing the Mission Control update.',
        },
      ],
    })
  })

  it('paginates within the dashboard limit so older Telegram topics remain available', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `session-${index}`,
      source: 'telegram',
      user_id: '8304360654',
      session_key: `telegram-key-${index}`,
      thread_id: String(index + 2),
      title: `Topic ${index + 2}`,
      started_at: index + 1,
      last_active: index + 1,
    }))
    vi.mocked(listSessions)
      .mockResolvedValueOnce(firstPage as any)
      .mockResolvedValueOnce([
        {
          id: 'session-older',
          source: 'telegram',
          user_id: '8304360654',
          session_key: 'telegram-key-older',
          thread_id: '2246',
          title: 'Administration',
          started_at: 1,
          last_active: 1,
        },
      ] as any)

    const response = await handler({
      request: new Request('http://localhost/api/telegram-workstreams'),
    })

    expect(response.status).toBe(200)
    expect(listSessions).toHaveBeenNthCalledWith(1, 100, 0, {
      order: 'recent',
      source: 'telegram',
    })
    expect(listSessions).toHaveBeenNthCalledWith(2, 100, 100, {
      order: 'recent',
      source: 'telegram',
    })
    const payload = (await response.json()) as {
      workstreams: Array<{ topicId: string }>
    }
    expect(payload.workstreams).toHaveLength(101)
    expect(payload.workstreams.some((item) => item.topicId === '2246')).toBe(true)
  })

  it('includes a directory topic before it has Telegram messages', async () => {
    vi.mocked(listSessions).mockResolvedValue([])
    vi.mocked(rememberTopics).mockReturnValue(
      new Map([
        [
          '-1004374880092:91',
          {
            chatId: '-1004374880092',
            groupName: 'Gates',
            topicId: '91',
            title: 'New Gates Workstream',
            sessionId: 'new-hermes-session',
            sessionKey: 'agent:main:telegram:group:-1004374880092:91',
            createdAt: 500,
            updatedAt: 500,
          },
        ],
      ]),
    )

    const response = await handler({
      request: new Request('http://localhost/api/telegram-workstreams'),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      workstreams: [
        {
          sessionId: 'new-hermes-session',
          sessionKey: 'agent:main:telegram:group:-1004374880092:91',
          groupName: 'Gates',
          chatId: '-1004374880092',
          topicId: '91',
          title: 'New Gates Workstream',
          updatedAt: 500,
          messageCount: 0,
          isActive: false,
          preview: '',
        },
      ],
    })
  })

  it('prefers the group title Telegram reports over row metadata', async () => {
    vi.mocked(listSessions).mockResolvedValue([
      {
        id: 'session-157',
        source: 'telegram',
        user_id: '8304360654',
        session_key: 'agent:main:telegram:group:-1003925413812:157',
        display_name: 'Stale Name',
        started_at: 100,
        last_active: 100,
      },
    ] as any)
    vi.mocked(fetchTelegramGroupTitles).mockResolvedValue({
      '-1003925413812': 'Administration',
    })

    const response = await handler({
      request: new Request('http://localhost/api/telegram-workstreams'),
    })

    const payload = (await response.json()) as {
      workstreams: Array<{ groupName: string; chatId: string; topicId: string }>
    }
    expect(payload.workstreams[0]).toMatchObject({
      groupName: 'Administration',
      chatId: '-1003925413812',
      topicId: '157',
    })
  })

  it('records observed topics in the directory so they survive a sparse page', async () => {
    vi.mocked(listSessions).mockResolvedValue([
      {
        id: 'session-157',
        source: 'telegram',
        user_id: '8304360654',
        session_key: 'agent:main:telegram:group:-1003925413812:157',
        display_name: 'Administration',
        title: 'AI generated session title',
        started_at: 100,
        last_active: 200,
      },
    ] as any)

    await handler({
      request: new Request('http://localhost/api/telegram-workstreams'),
    })

    expect(rememberTopics).toHaveBeenCalledWith([
      expect.objectContaining({
        chatId: '-1003925413812',
        topicId: '157',
        groupName: 'Administration',
        sessionId: 'session-157',
        // The Hermes session title is never recorded as the topic's name.
        title: '',
      }),
    ])
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
