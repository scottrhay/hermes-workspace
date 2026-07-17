import { describe, expect, it } from 'vitest'
import {
  filterTelegramWorkstreams,
  groupTelegramWorkstreams,
} from './telegram-workstreams'

const rows = [
  {
    sessionId: 'exec-1',
    sessionKey: 'exec-key',
    groupName: 'Executive Administration',
    topicId: '2246',
    title: 'Mission Control integration',
    updatedAt: 300,
    messageCount: 10,
  },
  {
    sessionId: 'research-1',
    sessionKey: 'research-key',
    groupName: 'Research',
    topicId: '5',
    title: 'Agent patterns',
    updatedAt: 200,
    messageCount: 5,
  },
  {
    sessionId: 'exec-2',
    sessionKey: 'exec-key-2',
    groupName: 'Executive Administration',
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
})
