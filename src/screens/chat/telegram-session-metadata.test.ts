import { describe, expect, it } from 'vitest'
import { toSessionSummary } from '../../server/claude-api'
import { normalizeSessions } from './utils'

describe('Telegram session metadata continuity', () => {
  it('preserves the stable Telegram session key through server and client normalization', () => {
    const summary = toSessionSummary({
      id: 'session-2246',
      source: 'telegram',
      user_id: '8304360654',
      session_key: 'agent:main:telegram:group:g1:2246',
      chat_id: 'g1',
      chat_type: 'group',
      thread_id: '2246',
      display_name: 'Executive Administration',
      title: 'Mission Control integration',
      started_at: 100,
    })

    expect(summary).toEqual(
      expect.objectContaining({
        source: 'telegram',
        sessionKey: 'agent:main:telegram:group:g1:2246',
        threadId: '2246',
        displayName: 'Executive Administration',
      }),
    )

    expect(normalizeSessions([summary])).toEqual([
      expect.objectContaining({
        key: 'session-2246',
        friendlyId: 'session-2246',
        source: 'telegram',
        sessionKey: 'agent:main:telegram:group:g1:2246',
        threadId: '2246',
        displayName: 'Executive Administration',
      }),
    ])
  })
})
