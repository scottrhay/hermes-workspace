import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './telegram-topic-create'
import type * as TelegramTopicNames from '../../server/telegram-topic-names'
import type * as TelegramWorkstreams from '../../server/telegram-workstreams'

const {
  listSessions,
  createSession,
  deleteSession,
  createTelegramForumTopic,
  deleteTelegramForumTopic,
  rememberTopics,
  forgetTopic,
  readTopicDirectory,
  confirmTopicNameFromTelegram,
} = vi.hoisted(() => ({
  listSessions: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  createTelegramForumTopic: vi.fn(),
  deleteTelegramForumTopic: vi.fn(),
  rememberTopics: vi.fn(),
  forgetTopic: vi.fn(),
  readTopicDirectory: vi.fn(() => new Map()),
  confirmTopicNameFromTelegram: vi.fn(),
}))

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: () => true,
}))
vi.mock('../../server/claude-api', () => ({
  ensureGatewayProbed: vi.fn(),
  getGatewayCapabilities: () => ({ sessions: true, dashboard: { available: true } }),
  listSessions,
  createSession,
  deleteSession,
}))
vi.mock('../../server/telegram-forum-topics', () => ({
  createTelegramForumTopic,
  deleteTelegramForumTopic,
}))
vi.mock('../../server/telegram-topic-directory', () => ({
  rememberTopics,
  forgetTopic,
  readTopicDirectory,
}))
vi.mock('../../server/telegram-topic-names', async (importOriginal) => ({
  ...(await importOriginal<typeof TelegramTopicNames>()),
  confirmTopicNameFromTelegram,
}))
vi.mock('../../server/telegram-workstreams', async (importOriginal) => {
  const actual = await importOriginal<typeof TelegramWorkstreams>()
  return { ...actual, getTelegramOwnerUserId: () => '8304360654' }
})

function postRequest(body: unknown) {
  return new Request('http://localhost/api/telegram-topic-create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const gatesRow = {
  id: 'existing-session',
  source: 'telegram',
  user_id: '8304360654',
  session_key: 'agent:main:telegram:group:-1004374880092:2',
  chat_id: '-1004374880092',
  thread_id: '2',
  display_name: 'Gates',
  title: 'Existing',
}

describe('POST /api/telegram-topic-create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TELEGRAM_BOT_TOKEN = 'secret-token'
    listSessions.mockResolvedValue([gatesRow])
    createTelegramForumTopic.mockResolvedValue({
      topicId: '91',
      title: 'New Gates Workstream',
    })
    createSession.mockResolvedValue({ id: 'new-hermes-session' })
    deleteSession.mockResolvedValue(undefined)
    deleteTelegramForumTopic.mockResolvedValue(true)
  })

  it('creates and binds Telegram topic and Hermes session atomically', async () => {
    const handler = Route.options.server?.handlers?.POST as any
    const response = await handler({
      request: postRequest({
        chatId: '-1004374880092',
        groupName: 'Gates',
        name: 'New Gates Workstream',
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(createTelegramForumTopic).toHaveBeenCalledWith(
      '-1004374880092',
      'New Gates Workstream',
      'secret-token',
    )
    expect(createSession).toHaveBeenCalledWith({ title: 'New Gates Workstream' })
    expect(rememberTopics).toHaveBeenCalledWith([
      expect.objectContaining({
        chatId: '-1004374880092',
        groupName: 'Gates',
        topicId: '91',
        sessionId: 'new-hermes-session',
        sessionKey: 'agent:main:telegram:group:-1004374880092:91',
      }),
    ])
    // Telegram accepted this name, so it is recorded as confirmed rather than
    // as a local override that a later Telegram rename would have to fight.
    expect(confirmTopicNameFromTelegram).toHaveBeenCalledWith(
      '-1004374880092',
      '91',
      'New Gates Workstream',
      expect.any(Number),
    )
    expect(payload).toMatchObject({
      ok: true,
      topic: {
        topicId: '91',
        sessionId: 'new-hermes-session',
        sessionKey: 'agent:main:telegram:group:-1004374880092:91',
        title: 'New Gates Workstream',
      },
    })
  })

  it('rolls back the Telegram topic when Hermes session creation fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    createSession.mockRejectedValue(new Error('Hermes unavailable'))
    const handler = Route.options.server?.handlers?.POST as any
    const response = await handler({
      request: postRequest({
        chatId: '-1004374880092',
        groupName: 'Gates',
        name: 'Rollback Topic',
      }),
    })

    expect(response.status).toBe(502)
    expect(deleteTelegramForumTopic).toHaveBeenCalledWith(
      '-1004374880092',
      '91',
      'secret-token',
    )
    expect(rememberTopics).not.toHaveBeenCalled()
    // Telegram deleted the topic, so this is the explicit delete that is
    // allowed to remove it from the directory.
    expect(forgetTopic).toHaveBeenCalledWith('-1004374880092', '91')
    consoleError.mockRestore()
  })

  it('rejects chats that are not already authorized workstream groups', async () => {
    const handler = Route.options.server?.handlers?.POST as any
    const response = await handler({
      request: postRequest({
        chatId: '-1000000000000',
        groupName: 'Unknown',
        name: 'Blocked Topic',
      }),
    })

    expect(response.status).toBe(404)
    expect(createTelegramForumTopic).not.toHaveBeenCalled()
  })
})
