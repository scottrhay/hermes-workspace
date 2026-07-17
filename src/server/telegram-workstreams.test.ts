import { describe, expect, it } from 'vitest'
import {
  getTelegramOwnerUserId,
  isAuthorizedTelegramSessionPair,
  isTelegramWorkstreamActive,
  normalizeTelegramWorkstreams,
  resolveAuthorizedTelegramWorkstream,
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
        topicId: '88',
        title: 'Topic 88',
        updatedAt: 100000,
        messageCount: 0,
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

  it('detects activity only on the newest concrete session for a workstream', () => {
    const rows = [
      {
        id: 'older',
        source: 'telegram',
        user_id: SCOTT_ID,
        session_key: 'shared-key',
        thread_id: '2246',
        started_at: 100,
        is_active: true,
      },
      {
        id: 'newer',
        source: 'telegram',
        user_id: SCOTT_ID,
        session_key: 'shared-key',
        thread_id: '2246',
        started_at: 200,
        is_active: false,
      },
    ]

    expect(isTelegramWorkstreamActive(rows, 'shared-key', SCOTT_ID)).toBe(false)
    rows[1].is_active = true
    expect(isTelegramWorkstreamActive(rows, 'shared-key', SCOTT_ID)).toBe(true)
  })
})
