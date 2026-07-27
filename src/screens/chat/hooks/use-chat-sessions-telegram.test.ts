import { describe, expect, it } from 'vitest'
import {
  buildSyntheticActiveSession,
  mergeTelegramMetadata,
} from './use-chat-sessions'
import type { SessionMeta } from '../types'

describe('mergeTelegramMetadata', () => {
  it('prefers the workstream topic title over the session AI title', () => {
    const session = {
      key: 'k1',
      friendlyId: '20260719_151504_3699f801',
      title: 'Mission Control Repo Key Learnings',
      derivedTitle: 'Mission Control Repo Key Learnings',
    } as SessionMeta

    const merged = mergeTelegramMetadata(session, {
      sessionId: '20260719_151504_3699f801',
      sessionKey: 'agent:main:telegram:group:-1003753506374:638',
      groupName: 'Research',
      chatId: '-1003753506374',
      topicId: '638',
      title: 'Repos',
      updatedAt: 100,
      messageCount: 78,
      isActive: false,
      preview: '',
    })

    expect(merged.title).toBe('Repos')
    expect(merged.derivedTitle).toBe('Repos')
    expect(merged.source).toBe('telegram')
  })
})

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
        chatId: '-1003486975784',
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
