import { describe, expect, it } from 'vitest'
import {
  getAttentionWorkstreams,
  getGroupIcon,
  getWorkstreamState,
  sortWorkstreamGroups,
} from './chat-workstreams-view'
import type { TelegramWorkstream } from './telegram-workstreams'

const workstream = (
  overrides: Partial<TelegramWorkstream>,
): TelegramWorkstream => ({
  sessionId: 'session-1',
  sessionKey: 'stable-1',
  groupName: 'Research',
  topicId: '5',
  title: 'AI Research',
  updatedAt: 100,
  messageCount: 12,
  preview: '',
  isActive: false,
  ...overrides,
})

describe('Mission Control workstream view', () => {
  it('prioritizes active workstreams, then the newest activity', () => {
    const items = [
      workstream({ sessionId: 'old', updatedAt: 100 }),
      workstream({ sessionId: 'new', updatedAt: 300 }),
      workstream({ sessionId: 'active', updatedAt: 200, isActive: true }),
    ]

    expect(getAttentionWorkstreams(items, 2).map((item) => item.sessionId)).toEqual([
      'active',
      'new',
    ])
  })

  it('uses honest live-state labels instead of treating message totals as unread', () => {
    expect(getWorkstreamState(workstream({ isActive: true }))).toBe('working')
    expect(getWorkstreamState(workstream({ isActive: false }))).toBe('recent')
  })

  it('sorts groups by newest topic and provides stable group icons', () => {
    const groups = sortWorkstreamGroups([
      {
        name: 'Training',
        workstreams: [workstream({ groupName: 'Training', updatedAt: 100 })],
      },
      {
        name: 'Executive Administration',
        workstreams: [
          workstream({ groupName: 'Executive Administration', updatedAt: 300 }),
        ],
      },
    ])

    expect(groups.map((group) => group.name)).toEqual([
      'Executive Administration',
      'Training',
    ])
    expect(getGroupIcon('Executive Administration')).toBe('⭐')
    expect(getGroupIcon('Research')).toBe('📁')
    expect(getGroupIcon('Unknown')).toBe('💬')
  })
})
