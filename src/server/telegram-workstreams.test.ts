import { describe, expect, it } from 'vitest'
import {
  getTelegramOwnerUserId,
  isAuthorizedTelegramSessionPair,
  normalizeTelegramWorkstreams,
  publicTelegramStreamFailure,
  publicTelegramToolEvent,
  publicTelegramToolFailure,
  resolveAuthorizedTelegramWorkstream,
  stripTelegramSenderPrefix,
} from './telegram-workstreams'

const SCOTT_ID = '8304360654'

describe('normalizeTelegramWorkstreams', () => {
  it('supports the AIA owner override while retaining Scott as the default', () => {
    expect(getTelegramOwnerUserId({ AIA_TELEGRAM_OWNER_USER_ID: '123' })).toBe(
      '123',
    )
    expect(getTelegramOwnerUserId({})).toBe(SCOTT_ID)
  })

  it('returns the newest Scott-owned session for each stable Telegram workstream', () => {
    const rows = [
      {
        id: 'older',
        source: 'telegram',
        user_id: SCOTT_ID,
        session_key: 'agent:main:telegram:group:g1:2246',
        thread_id: '2246',
        display_name: 'Executive Administration',
        title: 'Older title',
        started_at: 100,
        last_active: 500,
        message_count: 10,
      },
      {
        id: 'newer',
        source: 'telegram',
        user_id: SCOTT_ID,
        session_key: 'agent:main:telegram:group:g1:2246',
        thread_id: '2246',
        display_name: 'Executive Administration',
        title: 'Current title',
        started_at: 200,
        last_active: 400,
        message_count: 20,
      },
      {
        id: 'research',
        source: 'telegram',
        user_id: SCOTT_ID,
        session_key: 'agent:main:telegram:group:g2:5',
        thread_id: '5',
        display_name: 'Research',
        title: 'Research item',
        started_at: 300,
        last_active: 600,
        message_count: 30,
      },
    ]

    expect(normalizeTelegramWorkstreams(rows, SCOTT_ID)).toEqual([
      expect.objectContaining({
        sessionId: 'research',
        sessionKey: 'agent:main:telegram:group:g2:5',
        groupName: 'Research',
        topicId: '5',
      }),
      expect.objectContaining({
        sessionId: 'newer',
        sessionKey: 'agent:main:telegram:group:g1:2246',
        groupName: 'Executive Administration',
        title: 'Current title',
      }),
    ])
  })

  it('excludes General, other users, non-Telegram rows, and incomplete routing rows', () => {
    const valid = {
      id: 'valid',
      source: 'telegram',
      user_id: SCOTT_ID,
      session_key: 'agent:main:telegram:group:g1:22',
      thread_id: '22',
      display_name: 'Projects',
      started_at: 100,
    }
    const rows = [
      valid,
      { ...valid, id: 'general', session_key: 'general', thread_id: '1' },
      { ...valid, id: 'other-user', session_key: 'other', user_id: '999' },
      { ...valid, id: 'cli', session_key: 'cli', source: 'cli' },
      { ...valid, id: 'missing-key', session_key: null },
      {
        ...valid,
        id: 'missing-topic',
        session_key: 'missing-topic',
        thread_id: null,
      },
    ]

    expect(normalizeTelegramWorkstreams(rows, SCOTT_ID)).toEqual([
      expect.objectContaining({ sessionId: 'valid' }),
    ])
  })

  it('backfills a missing group name from an older row in the same workstream', () => {
    const result = normalizeTelegramWorkstreams(
      [
        {
          id: 'older',
          source: 'telegram',
          user_id: SCOTT_ID,
          session_key: 'shared-key',
          thread_id: '633',
          display_name: 'Executive Administration',
          started_at: 100,
        },
        {
          id: 'newer',
          source: 'telegram',
          user_id: SCOTT_ID,
          session_key: 'shared-key',
          thread_id: '633',
          title: 'Gateway maintenance',
          started_at: 200,
        },
      ],
      SCOTT_ID,
    )

    expect(result[0]).toEqual(
      expect.objectContaining({
        sessionId: 'newer',
        groupName: 'Executive Administration',
      }),
    )
  })

  it('backfills a missing group name from another topic in the same Telegram group', () => {
    const result = normalizeTelegramWorkstreams(
      [
        {
          id: 'known-topic',
          source: 'telegram',
          user_id: SCOTT_ID,
          session_key: 'known-key',
          chat_id: 'group-1',
          thread_id: '2246',
          display_name: 'Executive Administration',
          started_at: 100,
        },
        {
          id: 'unknown-topic',
          source: 'telegram',
          user_id: SCOTT_ID,
          session_key: 'unknown-key',
          chat_id: 'group-1',
          thread_id: '633',
          title: 'Gateway maintenance',
          started_at: 200,
        },
      ],
      SCOTT_ID,
    )

    expect(result.find((item) => item.sessionId === 'unknown-topic')).toEqual(
      expect.objectContaining({ groupName: 'Executive Administration' }),
    )
  })

  it('falls back to origin group name and a topic-number title without exposing origin data', () => {
    const result = normalizeTelegramWorkstreams(
      [
        {
          id: 'session-1',
          source: 'telegram',
          user_id: SCOTT_ID,
          session_key: 'key-1',
          thread_id: '88',
          origin_json: JSON.stringify({ chat_name: 'Training' }),
          started_at: 100,
        },
      ],
      SCOTT_ID,
    )

    expect(result).toEqual([
      {
        sessionId: 'session-1',
        sessionKey: 'key-1',
        groupName: 'Training',
        chatId: '',
        topicId: '88',
        title: 'Topic 88',
        updatedAt: 100000,
        messageCount: 0,
        isActive: false,
        preview: '',
      },
    ])
    expect(result[0]).not.toHaveProperty('origin_json')
  })

  it('authorizes only Scott-owned stable workstream keys', () => {
    const rows = [
      {
        id: 'scott-session',
        source: 'telegram',
        user_id: SCOTT_ID,
        session_key: 'scott-key',
        thread_id: '25',
        started_at: 100,
      },
      {
        id: 'other-session',
        source: 'telegram',
        user_id: 'other-user',
        session_key: 'other-key',
        thread_id: '26',
        started_at: 200,
      },
    ]

    expect(
      resolveAuthorizedTelegramWorkstream(rows, 'scott-key', SCOTT_ID)
        ?.sessionId,
    ).toBe('scott-session')
    expect(
      resolveAuthorizedTelegramWorkstream(rows, 'other-key', SCOTT_ID),
    ).toBeNull()
    expect(
      resolveAuthorizedTelegramWorkstream(rows, 'unknown-key', SCOTT_ID),
    ).toBeNull()
  })

  it('requires the concrete session to belong to the same Scott-owned stable key', () => {
    const rows = [
      {
        id: 'older-session',
        source: 'telegram',
        user_id: SCOTT_ID,
        session_key: 'stable-key',
        thread_id: '25',
      },
      {
        id: 'other-session',
        source: 'telegram',
        user_id: SCOTT_ID,
        session_key: 'other-key',
        thread_id: '633',
      },
    ]

    expect(
      isAuthorizedTelegramSessionPair(
        rows,
        'stable-key',
        'older-session',
        SCOTT_ID,
      ),
    ).toBe(true)
    expect(
      isAuthorizedTelegramSessionPair(
        rows,
        'stable-key',
        'other-session',
        SCOTT_ID,
      ),
    ).toBe(false)
    expect(
      isAuthorizedTelegramSessionPair(
        rows,
        'stable-key',
        'missing-session',
        SCOTT_ID,
      ),
    ).toBe(false)
  })

  it('does not expose opaque upstream tool diagnostics for Telegram sends', () => {
    const diagnostic = 'proxy bearer secret at /internal/path'

    expect(publicTelegramToolFailure('agent:main:telegram:key', diagnostic)).toBe(
      'Tool failed. Retry shortly.',
    )
    expect(publicTelegramToolFailure(undefined, diagnostic)).toBe(diagnostic)
    expect(
      publicTelegramToolEvent('agent:main:telegram:key', {
        phase: 'error',
        result: diagnostic,
        toolCallId: 'call-1',
      }),
    ).toEqual({
      phase: 'error',
      result: 'Tool failed. Retry shortly.',
      toolCallId: 'call-1',
    })
  })

  it('does not expose portable stream diagnostics for Telegram sends', () => {
    const diagnostic = 'OPAQUE_LOCAL_MODEL_DIAGNOSTIC_8f2a /internal/path'

    expect(
      publicTelegramStreamFailure('agent:main:telegram:key', diagnostic),
    ).toBe('Hermes response failed. Retry shortly.')
    expect(publicTelegramStreamFailure(undefined, diagnostic)).toBe(diagnostic)
  })

  it('uses last activity and session id as deterministic tie breakers', () => {
    const result = normalizeTelegramWorkstreams(
      [
        {
          id: 'session-a',
          source: 'telegram',
          user_id: SCOTT_ID,
          session_key: 'shared-key',
          thread_id: '25',
          started_at: 100,
          last_active: 300,
        },
        {
          id: 'session-b',
          source: 'telegram',
          user_id: SCOTT_ID,
          session_key: 'shared-key',
          thread_id: '25',
          started_at: 100,
          last_active: 400,
        },
      ],
      SCOTT_ID,
    )

    expect(result[0].sessionId).toBe('session-b')
  })

  it('populates chatId from row.chat_id, falling back to origin_json', () => {
    const rows = [
      {
        id: 'from-row',
        source: 'telegram',
        user_id: SCOTT_ID,
        session_key: 'key-row',
        chat_id: 'row-chat-1',
        thread_id: '10',
        started_at: 100,
      },
      {
        id: 'from-origin',
        source: 'telegram',
        user_id: SCOTT_ID,
        session_key: 'key-origin',
        thread_id: '11',
        origin_json: JSON.stringify({ chat_id: 'origin-chat-1' }),
        started_at: 100,
      },
      {
        id: 'no-chat-id',
        source: 'telegram',
        user_id: SCOTT_ID,
        session_key: 'key-none',
        thread_id: '12',
        started_at: 100,
      },
    ]

    const result = normalizeTelegramWorkstreams(rows, SCOTT_ID)

    expect(result.find((w) => w.sessionId === 'from-row')?.chatId).toBe(
      'row-chat-1',
    )
    expect(result.find((w) => w.sessionId === 'from-origin')?.chatId).toBe(
      'origin-chat-1',
    )
    expect(result.find((w) => w.sessionId === 'no-chat-id')?.chatId).toBe('')
  })

  it('prefers a topic name override over origin chat_topic, title, and the numeric fallback', () => {
    const baseRow = {
      source: 'telegram',
      user_id: SCOTT_ID,
      chat_id: 'chat-1',
      started_at: 100,
    }

    const overridden = normalizeTelegramWorkstreams(
      [
        {
          ...baseRow,
          id: 's-override',
          session_key: 'key-override',
          thread_id: '20',
          origin_json: JSON.stringify({ chat_topic: 'From Telegram' }),
          title: 'AI generated title',
        },
      ],
      SCOTT_ID,
      { 'chat-1:20': 'User override' },
    )
    expect(overridden[0].title).toBe('User override')

    const usesOrigin = normalizeTelegramWorkstreams(
      [
        {
          ...baseRow,
          id: 's-origin',
          session_key: 'key-origin-title',
          thread_id: '21',
          origin_json: JSON.stringify({ chat_topic: 'From Telegram' }),
          title: 'AI generated title',
        },
      ],
      SCOTT_ID,
    )
    expect(usesOrigin[0].title).toBe('From Telegram')

    const usesRowTitle = normalizeTelegramWorkstreams(
      [
        {
          ...baseRow,
          id: 's-title',
          session_key: 'key-title',
          thread_id: '22',
          title: 'AI generated title',
        },
      ],
      SCOTT_ID,
    )
    expect(usesRowTitle[0].title).toBe('AI generated title')

    const usesFallback = normalizeTelegramWorkstreams(
      [
        {
          ...baseRow,
          id: 's-fallback',
          session_key: 'key-fallback',
          thread_id: '23',
        },
      ],
      SCOTT_ID,
    )
    expect(usesFallback[0].title).toBe('Topic 23')
  })

  it('preserves prior behavior when the overrides argument is omitted', () => {
    const rows = [
      {
        id: 'session-1',
        source: 'telegram',
        user_id: SCOTT_ID,
        session_key: 'key-1',
        chat_id: 'chat-1',
        thread_id: '30',
        title: 'Existing title',
        started_at: 100,
      },
    ]

    expect(normalizeTelegramWorkstreams(rows, SCOTT_ID)).toEqual(
      normalizeTelegramWorkstreams(rows, SCOTT_ID, {}),
    )
  })
})

describe('stripTelegramSenderPrefix', () => {
  it('strips a leading [Sender Name] tag', () => {
    expect(stripTelegramSenderPrefix('[Scott Hay] hello')).toBe('hello')
  })

  it('leaves a trailing bracketed tag unchanged', () => {
    expect(stripTelegramSenderPrefix('hello [Scott Hay]')).toBe(
      'hello [Scott Hay]',
    )
  })

  it('strips only the first prefix, never repeatedly', () => {
    expect(stripTelegramSenderPrefix('[Scott Hay] [URGENT] do it')).toBe(
      '[URGENT] do it',
    )
  })

  it('leaves text with no prefix unchanged', () => {
    expect(stripTelegramSenderPrefix('no prefix here')).toBe(
      'no prefix here',
    )
  })

  it('leaves empty brackets unchanged since the regex requires 1+ chars', () => {
    expect(stripTelegramSenderPrefix('[] hello')).toBe('[] hello')
  })

  it('leaves multi-line text whose first line does not match unchanged', () => {
    const text = 'no prefix on this line\n[Scott Hay] second line'
    expect(stripTelegramSenderPrefix(text)).toBe(text)
  })
})
