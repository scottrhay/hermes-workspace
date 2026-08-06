import { describe, expect, it, vi } from 'vitest'
import {
  createTelegramTopic,
  filterTelegramWorkstreams,
  groupTelegramWorkstreams,
} from './telegram-workstreams'

const rows = [
  {
    sessionId: 'exec-1',
    sessionKey: 'exec-key',
    groupName: 'Executive Administration',
    chatId: 'chat-exec',
    topicId: '2246',
    title: 'Mission Control integration',
    updatedAt: 300,
    messageCount: 10,
  },
  {
    sessionId: 'research-1',
    sessionKey: 'research-key',
    groupName: 'Research',
    chatId: 'chat-research',
    topicId: '5',
    title: 'Agent patterns',
    updatedAt: 200,
    messageCount: 5,
  },
  {
    sessionId: 'exec-2',
    sessionKey: 'exec-key-2',
    groupName: 'Executive Administration',
    chatId: 'chat-exec',
    topicId: '98',
    title: 'Morning email triage',
    updatedAt: 100,
    messageCount: 2,
  },
]

describe('Telegram workstream presentation', () => {
  it('groups workstreams by group while preserving recent order', () => {
    expect(groupTelegramWorkstreams(rows)).toEqual([
      {
        name: 'Executive Administration',
        workstreams: [rows[0], rows[2]],
      },
      { name: 'Research', workstreams: [rows[1]] },
    ])
  })

  it('searches group, title, and topic number case-insensitively', () => {
    expect(filterTelegramWorkstreams(rows, 'research')).toEqual([rows[1]])
    expect(filterTelegramWorkstreams(rows, 'EMAIL')).toEqual([rows[2]])
    expect(filterTelegramWorkstreams(rows, '2246')).toEqual([rows[0]])
    expect(filterTelegramWorkstreams(rows, '  ')).toEqual(rows)
  })

  it('creates a bound Telegram topic through Mission Control', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          topic: {
            sessionId: 'new-session',
            sessionKey: 'agent:main:telegram:group:chat-exec:91',
            chatId: 'chat-exec',
            groupName: 'Executive Administration',
            topicId: '91',
            title: 'New workstream',
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createTelegramTopic({
        chatId: 'chat-exec',
        groupName: 'Executive Administration',
        name: 'New workstream',
      }),
    ).resolves.toMatchObject({ sessionId: 'new-session', topicId: '91' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/telegram-topic-create',
      expect.objectContaining({ method: 'POST' }),
    )
    vi.unstubAllGlobals()
  })
})
