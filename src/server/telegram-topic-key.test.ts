import { describe, expect, it } from 'vitest'
import {
  GENERAL_TOPIC_ID,
  isGeneralTopicId,
  normalizeTopicId,
  parseTelegramSessionKey,
  telegramSessionKey,
  topicKey,
} from './telegram-topic-key'

describe('normalizeTopicId', () => {
  it('treats a missing thread reference as the General topic', () => {
    // tweb's getMessageThreadId() falls back to GENERAL_TOPIC_ID for any
    // forum message with no thread reference — in a forum there is no such
    // thing as a message that belongs to no topic.
    expect(normalizeTopicId(undefined)).toBe(GENERAL_TOPIC_ID)
    expect(normalizeTopicId(null)).toBe(GENERAL_TOPIC_ID)
    expect(normalizeTopicId('')).toBe(GENERAL_TOPIC_ID)
    expect(normalizeTopicId('   ')).toBe(GENERAL_TOPIC_ID)
    expect(normalizeTopicId('0')).toBe(GENERAL_TOPIC_ID)
    expect(normalizeTopicId(0)).toBe(GENERAL_TOPIC_ID)
  })

  it('preserves a real topic id from either a string or a number', () => {
    expect(normalizeTopicId('2246')).toBe('2246')
    expect(normalizeTopicId(2246)).toBe('2246')
    expect(normalizeTopicId(' 91 ')).toBe('91')
  })

  it('identifies the General topic through every spelling', () => {
    expect(isGeneralTopicId('1')).toBe(true)
    expect(isGeneralTopicId(null)).toBe(true)
    expect(isGeneralTopicId('0')).toBe(true)
    expect(isGeneralTopicId('2')).toBe(false)
  })
})

describe('topicKey', () => {
  it('keys a topic by its chat and thread, normalizing General', () => {
    expect(topicKey('-1003925413812', '157')).toBe('-1003925413812:157')
    expect(topicKey('-1003925413812', null)).toBe('-1003925413812:1')
    expect(topicKey(-1003925413812, 157)).toBe('-1003925413812:157')
  })

  it('refuses to key a topic with no chat to key against', () => {
    expect(topicKey('', '157')).toBe('')
    expect(topicKey(null, '157')).toBe('')
  })
})

describe('telegram session keys', () => {
  it('round-trips a chat and topic through the gateway routing key', () => {
    const key = telegramSessionKey('-1003925413812', '2246')
    expect(key).toBe('agent:main:telegram:group:-1003925413812:2246')
    expect(parseTelegramSessionKey(key)).toEqual({
      chatId: '-1003925413812',
      topicId: '2246',
    })
  })

  it('recovers identity from a live gateway key', () => {
    expect(
      parseTelegramSessionKey('agent:main:telegram:group:-1003395312608:331'),
    ).toEqual({ chatId: '-1003395312608', topicId: '331' })
  })

  it('rejects keys that are not stable Telegram topic keys', () => {
    expect(parseTelegramSessionKey('shared-key')).toBeNull()
    expect(parseTelegramSessionKey('agent:main:telegram:group:only-chat')).toBeNull()
    expect(
      parseTelegramSessionKey('agent:main:telegram:group:chat:1:extra'),
    ).toBeNull()
    expect(parseTelegramSessionKey(undefined)).toBeNull()
  })
})
