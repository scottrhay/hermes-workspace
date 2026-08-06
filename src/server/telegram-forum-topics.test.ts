import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTelegramForumTopic,
  deleteTelegramForumTopic,
} from './telegram-forum-topics'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Telegram forum topic API', () => {
  it('creates a topic and returns Telegram message_thread_id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: { message_thread_id: 91, name: 'New Gates Workstream' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createTelegramForumTopic(
        '-1004374880092',
        'New Gates Workstream',
        'secret-token',
      ),
    ).resolves.toEqual({ topicId: '91', title: 'New Gates Workstream' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/botsecret-token/createForumTopic',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          chat_id: '-1004374880092',
          name: 'New Gates Workstream',
        }),
      }),
    )
  })

  it('fails clearly when Telegram rejects topic creation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ ok: false, description: 'Bad Request: not enough rights' }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    await expect(
      createTelegramForumTopic('-1004374880092', 'Blocked', 'secret-token'),
    ).rejects.toThrow('Bad Request: not enough rights')
  })

  it('can delete a newly-created topic during rollback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      deleteTelegramForumTopic('-1004374880092', '91', 'secret-token'),
    ).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/botsecret-token/deleteForumTopic',
      expect.objectContaining({
        body: JSON.stringify({
          chat_id: '-1004374880092',
          message_thread_id: 91,
        }),
      }),
    )
  })
})
