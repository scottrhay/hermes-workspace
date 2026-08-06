import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  ensureGatewayProbed,
  getGatewayCapabilities,
  listSessions,
} from '../../server/claude-api'
import {
  confirmTopicNameFromTelegram,
  setTopicNameOverride,
} from '../../server/telegram-topic-names'
import { Route } from './telegram-topic-name'
import type * as TelegramTopicNames from '../../server/telegram-topic-names'

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

vi.mock('../../server/claude-api', () => ({
  ensureGatewayProbed: vi.fn(),
  getGatewayCapabilities: vi.fn(),
  listSessions: vi.fn(),
}))

vi.mock('../../server/telegram-topic-names', async (importOriginal) => {
  const actual = await importOriginal<typeof TelegramTopicNames>()
  return {
    ...actual,
    // Both writers must be stubbed: either one reaching the real module would
    // persist test fixtures into the developer's own workspace state dir.
    setTopicNameOverride: vi.fn(),
    confirmTopicNameFromTelegram: vi.fn(),
  }
})

type RouteWithPost = typeof Route & {
  options: {
    server: {
      handlers: {
        POST: (ctx: { request: Request }) => Promise<Response>
      }
    }
  }
}

const handler = (Route as RouteWithPost).options.server.handlers.POST

const AUTHORIZED_SESSION = {
  id: 'session-2246',
  source: 'telegram',
  user_id: '8304360654',
  session_key: 'telegram-key-2246',
  chat_id: 'chat-1',
  thread_id: '2246',
  display_name: 'Executive Administration',
  title: 'Mission Control integration',
  started_at: 100,
  last_active: 200,
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/telegram-topic-name', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

let originalFetch: typeof global.fetch
let originalToken: string | undefined

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
  vi.mocked(listSessions).mockResolvedValue([AUTHORIZED_SESSION] as any)
  originalFetch = global.fetch
  originalToken = process.env.TELEGRAM_BOT_TOKEN
})

afterEach(() => {
  global.fetch = originalFetch
  if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN
  else process.env.TELEGRAM_BOT_TOKEN = originalToken
})

describe('POST /api/telegram-topic-name', () => {
  it('requires Workspace authentication', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)

    const response = await handler({
      request: postRequest({ chatId: 'chat-1', topicId: '2246', name: 'x' }),
    })

    expect(response.status).toBe(401)
    expect(setTopicNameOverride).not.toHaveBeenCalled()
  })

  it('rejects a chatId/topicId pair that is not an authorized workstream', async () => {
    const response = await handler({
      request: postRequest({
        chatId: 'chat-1',
        topicId: 'not-a-real-topic',
        name: 'New Name',
      }),
    })

    expect(response.status).toBe(404)
    expect(setTopicNameOverride).not.toHaveBeenCalled()
  })

  it('finds an authorized topic beyond the first dashboard page', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      ...AUTHORIZED_SESSION,
      id: `older-${index}`,
      session_key: `older-key-${index}`,
      thread_id: String(index + 10_000),
    }))
    vi.mocked(listSessions)
      .mockResolvedValueOnce(firstPage as any)
      .mockResolvedValueOnce([AUTHORIZED_SESSION] as any)
    delete process.env.TELEGRAM_BOT_TOKEN

    const response = await handler({
      request: postRequest({
        chatId: 'chat-1',
        topicId: '2246',
        name: 'Administration',
        pushToTelegram: false,
      }),
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
  })

  it('saves the override and reports unavailable when no bot token is configured', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN
    global.fetch = vi.fn()

    const response = await handler({
      request: postRequest({
        chatId: 'chat-1',
        topicId: '2246',
        name: 'New Topic Name',
      }),
    })

    expect(response.status).toBe(200)
    expect(setTopicNameOverride).toHaveBeenCalledWith(
      'chat-1',
      '2246',
      'New Topic Name',
    )
    expect(global.fetch).not.toHaveBeenCalled()
    expect(await response.json()).toEqual({ ok: true, telegram: 'unavailable' })
  })

  it('reports renamed when the Telegram push succeeds', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'super-secret-token'
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true }),
    }) as unknown as typeof fetch

    const response = await handler({
      request: postRequest({
        chatId: 'chat-1',
        topicId: '2246',
        name: 'New Topic Name',
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, telegram: 'renamed' })
    // Telegram now holds this name, so the record is promoted from a local
    // fallback to a confirmed one and stops fighting future observations.
    expect(confirmTopicNameFromTelegram).toHaveBeenCalledWith(
      'chat-1',
      '2246',
      'New Topic Name',
    )
  })

  it('leaves the name unconfirmed when the Telegram push fails', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'super-secret-token'
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: false, description: 'CHAT_NOT_FOUND' }),
    }) as unknown as typeof fetch

    await handler({
      request: postRequest({
        chatId: 'chat-1',
        topicId: '2246',
        name: 'New Topic Name',
      }),
    })

    expect(confirmTopicNameFromTelegram).not.toHaveBeenCalled()
  })

  it('reports renamed when Telegram says the topic already has that name', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'super-secret-token'
    global.fetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: false,
          description: 'Bad Request: TOPIC_NOT_MODIFIED',
        }),
    }) as unknown as typeof fetch

    const response = await handler({
      request: postRequest({
        chatId: 'chat-1',
        topicId: '2246',
        name: 'New Topic Name',
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, telegram: 'renamed' })
  })

  it('reports failed with the Telegram description, without leaking the bot token', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'super-secret-token'
    global.fetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: false,
          description: 'Not enough rights to manage topics',
        }),
    }) as unknown as typeof fetch

    const response = await handler({
      request: postRequest({
        chatId: 'chat-1',
        topicId: '2246',
        name: 'New Topic Name',
      }),
    })

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toEqual({
      ok: true,
      telegram: 'failed',
      telegramError: 'Not enough rights to manage topics',
    })
    expect(JSON.stringify(payload)).not.toContain('super-secret-token')
  })

  it('never leaks the bot token when the Telegram request itself throws', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'super-secret-token'
    global.fetch = vi
      .fn()
      .mockRejectedValue(
        new Error('fetch failed: super-secret-token unreachable'),
      ) as unknown as typeof fetch

    const response = await handler({
      request: postRequest({
        chatId: 'chat-1',
        topicId: '2246',
        name: 'New Topic Name',
      }),
    })

    const payload = await response.json()
    expect(payload.telegram).toBe('failed')
    expect(JSON.stringify(payload)).not.toContain('super-secret-token')
  })
})
