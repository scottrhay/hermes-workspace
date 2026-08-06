import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  confirmTopicNameFromTelegram,
  readTopicNameOverrides,
  resolveTopicName,
  setTopicNameOverride,
  topicNameOverridesFilePath,
} from './telegram-topic-names'

let tmpDir = ''
let originalStateDir: string | undefined

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telegram-topic-names-'))
  originalStateDir = process.env.HERMES_WORKSPACE_STATE_DIR
  process.env.HERMES_WORKSPACE_STATE_DIR = tmpDir
})

afterEach(() => {
  if (originalStateDir === undefined) {
    delete process.env.HERMES_WORKSPACE_STATE_DIR
  } else {
    process.env.HERMES_WORKSPACE_STATE_DIR = originalStateDir
  }
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('readTopicNameOverrides', () => {
  it('returns an empty map when the file does not exist', () => {
    expect(readTopicNameOverrides()).toEqual({})
  })

  it('returns an empty map when the file is corrupt', () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(topicNameOverridesFilePath(), '{not valid json', 'utf8')
    expect(readTopicNameOverrides()).toEqual({})
  })

  it('round-trips a saved override with its provenance', () => {
    setTopicNameOverride('chat-1', '2246', 'Executive Administration')
    expect(readTopicNameOverrides()).toEqual({
      'chat-1:2246': {
        name: 'Executive Administration',
        source: 'local',
        updatedAt: expect.any(Number),
      },
    })
  })

  it('accumulates multiple overrides across separate calls', () => {
    setTopicNameOverride('chat-1', '2246', 'First Topic')
    setTopicNameOverride('chat-1', '633', 'Second Topic')
    expect(Object.keys(readTopicNameOverrides()).sort()).toEqual([
      'chat-1:2246',
      'chat-1:633',
    ])
  })

  it('migrates a legacy bare-string override to an unconfirmed local record', () => {
    // Dated to the epoch on purpose: a legacy override carries no evidence
    // that Telegram ever agreed to it, so any name Telegram reports wins.
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(
      topicNameOverridesFilePath(),
      JSON.stringify({ 'chat-1:2246': 'Legacy Name' }),
      'utf8',
    )
    expect(readTopicNameOverrides()).toEqual({
      'chat-1:2246': { name: 'Legacy Name', source: 'local', updatedAt: 0 },
    })
  })

  it('records a pushed rename as confirmed by Telegram', () => {
    confirmTopicNameFromTelegram('chat-1', '2246', 'Confirmed Name', 555)
    expect(readTopicNameOverrides()['chat-1:2246']).toEqual({
      name: 'Confirmed Name',
      source: 'telegram',
      updatedAt: 555,
    })
  })

  it('normalizes a General topic id so it cannot be saved under two keys', () => {
    setTopicNameOverride('chat-1', '0', 'General')
    expect(Object.keys(readTopicNameOverrides())).toEqual(['chat-1:1'])
  })
})

describe('resolveTopicName', () => {
  const local = { name: 'Local', source: 'local' as const, updatedAt: 900 }
  const confirmed = { name: 'Pushed', source: 'telegram' as const, updatedAt: 900 }

  it('prefers the name Telegram reports over an unconfirmed local name', () => {
    expect(resolveTopicName(local, 'From Telegram', 1000)).toBe('From Telegram')
  })

  it('prefers a confirmed name that is at least as recent as the observation', () => {
    expect(resolveTopicName(confirmed, 'Older Name', 900)).toBe('Pushed')
  })

  it('yields a confirmed name once Telegram reports something newer', () => {
    expect(resolveTopicName(confirmed, 'Newer Name', 1000)).toBe('Newer Name')
  })

  it('uses a saved name when Telegram has reported nothing', () => {
    expect(resolveTopicName(local, '', 1000)).toBe('Local')
  })

  it('falls through to the first non-empty fallback', () => {
    expect(resolveTopicName(undefined, '', 0, ['', 'Session title'])).toBe(
      'Session title',
    )
    expect(resolveTopicName(undefined, '', 0)).toBe('')
  })
})

describe('setTopicNameOverride validation', () => {
  it('rejects an empty chatId', () => {
    expect(() => setTopicNameOverride('', '10', 'Name')).toThrow(
      'chatId is required',
    )
  })

  it('rejects an empty topicId', () => {
    expect(() => setTopicNameOverride('chat-1', '', 'Name')).toThrow(
      'topicId is required',
    )
  })

  it('rejects an empty name', () => {
    expect(() => setTopicNameOverride('chat-1', '10', '  ')).toThrow(
      'name is required',
    )
  })

  it('rejects a name over 128 characters', () => {
    const longName = 'a'.repeat(129)
    expect(() => setTopicNameOverride('chat-1', '10', longName)).toThrow(
      'name must be 128 characters or fewer',
    )
  })

  it('accepts a name at exactly 128 characters', () => {
    const maxName = 'a'.repeat(128)
    expect(() => setTopicNameOverride('chat-1', '10', maxName)).not.toThrow()
  })
})
