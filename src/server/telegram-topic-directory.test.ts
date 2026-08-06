import { mkdtemp, rm } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  findTopicBySessionKey,
  forgetTopic,
  readTopicDirectory,
  reconcileChatTopics,
  rememberTopics,
} from './telegram-topic-directory'

let stateDir = ''

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), 'mc-topic-directory-'))
  process.env.HERMES_WORKSPACE_STATE_DIR = stateDir
})

afterEach(async () => {
  delete process.env.HERMES_WORKSPACE_STATE_DIR
  await rm(stateDir, { recursive: true, force: true })
})

const GATES = {
  chatId: '-1004374880092',
  topicId: '91',
  groupName: 'Gates',
  title: 'New Gates Workstream',
  sessionId: '20260803_created',
  sessionKey: 'agent:main:telegram:group:-1004374880092:91',
  observedAt: 1_000,
}

describe('telegram topic directory', () => {
  it('remembers a topic under its (chatId, topicId) key', () => {
    rememberTopics([GATES])
    expect(readTopicDirectory().get('-1004374880092:91')).toMatchObject({
      chatId: '-1004374880092',
      topicId: '91',
      groupName: 'Gates',
      title: 'New Gates Workstream',
      sessionId: '20260803_created',
    })
  })

  it('keeps a known topic when a later observation omits it', () => {
    // This is tdesktop's rule: topics leave only via applyTopicDeleted, never
    // because a page of results failed to mention them. Absence is not
    // evidence, and treating it as evidence is what made topics flicker.
    rememberTopics([GATES])
    rememberTopics([
      { ...GATES, chatId: '-1003925413812', topicId: '157', title: 'Other' },
    ])

    expect(Array.from(readTopicDirectory().keys()).sort()).toEqual([
      '-1003925413812:157',
      '-1004374880092:91',
    ])
  })

  it('enriches a known topic without letting a sparse observation erase it', () => {
    rememberTopics([GATES])
    rememberTopics([
      {
        chatId: GATES.chatId,
        topicId: GATES.topicId,
        sessionId: '20260805_newer',
        observedAt: 2_000,
      },
    ])

    expect(readTopicDirectory().get('-1004374880092:91')).toMatchObject({
      groupName: 'Gates',
      title: 'New Gates Workstream',
      sessionId: '20260805_newer',
      updatedAt: 2_000,
    })
  })

  it('removes a topic only through an explicit delete', () => {
    rememberTopics([GATES])
    expect(forgetTopic(GATES.chatId, GATES.topicId)).toBe(true)
    expect(readTopicDirectory().size).toBe(0)
    expect(forgetTopic(GATES.chatId, GATES.topicId)).toBe(false)
  })

  it('prunes topics missing from an authoritative Telegram listing', () => {
    // Sessions still referenced topics 208 and 19 after they were deleted in
    // Telegram, so they lingered in the list. A full getForumTopics listing
    // is the one signal that proves they are gone.
    rememberTopics([
      { ...GATES, topicId: '87', title: 'Emails' },
      { ...GATES, topicId: '126', title: 'Tech' },
      { ...GATES, topicId: '208', title: 'Deleted In Telegram' },
    ])

    const removed = reconcileChatTopics(GATES.chatId, ['87', '126'])

    expect(removed.map((topic) => topic.topicId)).toEqual(['208'])
    expect(Array.from(readTopicDirectory().keys()).sort()).toEqual([
      '-1004374880092:126',
      '-1004374880092:87',
    ])
  })

  it('never prunes on an empty listing, which means the sync failed', () => {
    rememberTopics([GATES])
    expect(reconcileChatTopics(GATES.chatId, [])).toEqual([])
    expect(readTopicDirectory().size).toBe(1)
  })

  it('leaves other chats untouched when reconciling one', () => {
    rememberTopics([
      GATES,
      { chatId: '-1003925413812', topicId: '157', title: 'HomeHalo' },
    ])

    reconcileChatTopics(GATES.chatId, ['999'])

    expect(Array.from(readTopicDirectory().keys())).toEqual([
      '-1003925413812:157',
    ])
  })

  it('resolves a topic by its gateway session key', () => {
    rememberTopics([GATES])
    expect(findTopicBySessionKey(GATES.sessionKey)).toMatchObject({
      topicId: '91',
    })
    expect(findTopicBySessionKey('agent:main:telegram:group:x:1')).toBeNull()
    expect(findTopicBySessionKey('')).toBeNull()
  })

  it('adopts topics from the retired created-topics store', () => {
    writeFileSync(
      join(stateDir, 'telegram-created-topics.json'),
      JSON.stringify([
        {
          chatId: '-1004374880092',
          groupName: 'Gates',
          topicId: '126',
          title: 'Running Mama Scout on a Phone',
          sessionId: '20260804_160630_76e24f27',
          sessionKey: 'agent:main:telegram:group:-1004374880092:126',
          createdAt: 500,
        },
      ]),
      'utf8',
    )

    expect(readTopicDirectory().get('-1004374880092:126')).toMatchObject({
      title: 'Running Mama Scout on a Phone',
      sessionId: '20260804_160630_76e24f27',
    })
  })

  it('ignores entries with no chat to key against', () => {
    rememberTopics([{ chatId: '', topicId: '91', title: 'Orphan' }])
    expect(readTopicDirectory().size).toBe(0)
  })

  it('survives a corrupt directory file', () => {
    writeFileSync(join(stateDir, 'telegram-topic-directory.json'), '{oops', 'utf8')
    expect(readTopicDirectory().size).toBe(0)
  })
})
