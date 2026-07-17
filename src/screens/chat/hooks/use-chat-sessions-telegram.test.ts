import { describe, expect, it } from 'vitest'
import { buildSyntheticActiveSession } from './use-chat-sessions'

describe('Telegram workstream session recovery', () => {
  it('recovers stable routing metadata when the selected session is outside the generic session list', () => {
    const session = buildSyntheticActiveSession(
      '20260716_120508_bbbb1b43',
      undefined,
      undefined,
      {
        sessionId: '20260716_120508_bbbb1b43',
        sessionKey: 'agent:main:telegram:group:-1003486975784:37',
        groupName: 'Projects',
        topicId: '37',
        title: 'Customer Portal URL for David',
        updatedAt: 100,
        messageCount: 76,
      },
    )

    expect(session).toEqual(
      expect.objectContaining({
        friendlyId: '20260716_120508_bbbb1b43',
        title: 'Customer Portal URL for David',
        source: 'telegram',
        sessionKey: 'agent:main:telegram:group:-1003486975784:37',
        threadId: '37',
        displayName: 'Projects',
      }),
    )
  })
})
