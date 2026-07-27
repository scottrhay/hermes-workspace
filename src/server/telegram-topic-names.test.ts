import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  readTopicNameOverrides,
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

  it('round-trips a saved override', () => {
    setTopicNameOverride('chat-1', '2246', 'Executive Administration')
    expect(readTopicNameOverrides()).toEqual({
      'chat-1:2246': 'Executive Administration',
    })
  })

  it('accumulates multiple overrides across separate calls', () => {
    setTopicNameOverride('chat-1', '2246', 'First Topic')
    setTopicNameOverride('chat-1', '633', 'Second Topic')
    expect(readTopicNameOverrides()).toEqual({
      'chat-1:2246': 'First Topic',
      'chat-1:633': 'Second Topic',
    })
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
