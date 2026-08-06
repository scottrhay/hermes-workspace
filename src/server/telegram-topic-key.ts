/**
 * Canonical Telegram forum identity.
 *
 * Telegram identifies a forum thread by `(chat, rootId)` and nothing else.
 * tdesktop keys `Data::Forum::_topics` by the topic-creation message's
 * `MsgId`; tweb's `getMessageThreadId()` falls back to `GENERAL_TOPIC_ID`
 * for any forum message carrying no thread reference. There is no "message
 * without a topic" in a forum, so every row we see normalizes onto exactly
 * one `(chatId, topicId)` pair.
 *
 * This module is the single place that decides what that pair is. Session
 * keys, name overrides, the topic directory, and workstream de-duplication
 * all key off `topicKey()` so they cannot drift apart.
 */

/**
 * Telegram's General topic — a real, permanent topic that cannot be deleted
 * (tdesktop guards deletion with `if (rootId != ForumTopic::kGeneralId)`).
 * Messages posted to a forum without a thread reference belong to it.
 */
export const GENERAL_TOPIC_ID = '1'

const SESSION_KEY_PREFIX = 'agent:main:telegram:group:'

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeChatId(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return clean(value)
}

/**
 * Normalizes a Telegram `message_thread_id` onto a topic id. Absent, empty,
 * and `0` all mean "no thread reference", which in a forum is the General
 * topic — the same fallback tweb applies in `getMessageThreadId()`.
 */
export function normalizeTopicId(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value === 0 ? GENERAL_TOPIC_ID : String(Math.trunc(value))
  }
  const raw = clean(value)
  if (!raw || raw === '0') return GENERAL_TOPIC_ID
  return raw
}

export function isGeneralTopicId(value: unknown): boolean {
  return normalizeTopicId(value) === GENERAL_TOPIC_ID
}

/**
 * The canonical `(chatId, topicId)` identity, as a map key. Returns an empty
 * string when there is no chat to key against — callers must treat that as
 * "not a Telegram topic" rather than as a usable key.
 */
export function topicKey(chatId: unknown, topicId: unknown): string {
  const chat = normalizeChatId(chatId)
  if (!chat) return ''
  return `${chat}:${normalizeTopicId(topicId)}`
}

/** The Hermes gateway routing key for a topic. Derived, never stored twice. */
export function telegramSessionKey(chatId: unknown, topicId: unknown): string {
  const key = topicKey(chatId, topicId)
  return key ? `${SESSION_KEY_PREFIX}${key}` : ''
}

/**
 * Recovers `(chatId, topicId)` from a gateway session key. This is our
 * analogue of tdesktop's `requestTopic(rootId)`: given only a routing key we
 * can resolve which topic it addresses without consulting session rows.
 */
export function parseTelegramSessionKey(
  sessionKey: unknown,
): { chatId: string; topicId: string } | null {
  const raw = clean(sessionKey)
  if (!raw.startsWith(SESSION_KEY_PREFIX)) return null
  const parts = raw.slice(SESSION_KEY_PREFIX.length).split(':')
  if (parts.length !== 2) return null
  const chatId = normalizeChatId(parts[0])
  if (!chatId) return null
  return { chatId, topicId: normalizeTopicId(parts[1]) }
}
