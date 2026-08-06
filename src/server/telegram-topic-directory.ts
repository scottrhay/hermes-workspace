import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getStateDir } from './workspace-state-dir'
import {
  normalizeChatId,
  normalizeTopicId,
  telegramSessionKey,
  topicKey,
} from './telegram-topic-key'

/**
 * The sticky Telegram topic directory.
 *
 * The Bot API has no `getForumTopics` — enumeration is MTProto-only, so
 * unlike tdesktop and tweb we cannot re-list a forum's topics on demand. We
 * therefore accumulate what we observe and, critically, adopt tdesktop's
 * removal rule: a topic leaves the directory only via an explicit delete
 * (`applyTopicDeleted`), never because it was missing from a page of
 * results. Absence is not evidence; that is what made topics flicker in and
 * out of the workstream list.
 *
 * Records are merged field-by-field and an empty incoming value never
 * overwrites a known one, so a sparse observation can add detail but cannot
 * erase it.
 */
export type TelegramTopicRecord = {
  chatId: string
  topicId: string
  groupName: string
  title: string
  sessionId: string
  sessionKey: string
  createdAt: number
  updatedAt: number
}

export type TelegramTopicObservation = {
  chatId: string
  topicId: string
  groupName?: string
  title?: string
  sessionId?: string
  sessionKey?: string
  observedAt?: number
}

const LEGACY_CREATED_TOPICS_FILE = 'telegram-created-topics.json'

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function finiteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function topicDirectoryFilePath(): string {
  return join(getStateDir(), 'telegram-topic-directory.json')
}

function legacyCreatedTopicsFilePath(): string {
  return join(getStateDir(), LEGACY_CREATED_TOPICS_FILE)
}

function toRecord(entry: unknown): TelegramTopicRecord | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  const raw = entry as Record<string, unknown>
  const chatId = normalizeChatId(raw.chatId)
  if (!chatId) return null
  const topicId = normalizeTopicId(raw.topicId)
  const createdAt = finiteNumber(raw.createdAt)
  return {
    chatId,
    topicId,
    groupName: clean(raw.groupName),
    title: clean(raw.title),
    sessionId: clean(raw.sessionId),
    sessionKey: clean(raw.sessionKey) || telegramSessionKey(chatId, topicId),
    createdAt,
    updatedAt: finiteNumber(raw.updatedAt) || createdAt,
  }
}

function readRecordsFrom(path: string): Array<TelegramTopicRecord> {
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(toRecord)
      .filter((record): record is TelegramTopicRecord => record !== null)
  } catch {
    return []
  }
}

/**
 * Reads the directory, keyed by `topicKey`. Topics recorded by the retired
 * `telegram-created-topics.json` store are folded in so an in-flight topic
 * created before this change keeps its Hermes binding.
 */
export function readTopicDirectory(): Map<string, TelegramTopicRecord> {
  const directory = new Map<string, TelegramTopicRecord>()
  const entries = [
    ...readRecordsFrom(legacyCreatedTopicsFilePath()),
    ...readRecordsFrom(topicDirectoryFilePath()),
  ]
  for (const record of entries) {
    const key = topicKey(record.chatId, record.topicId)
    if (!key) continue
    const existing = directory.get(key)
    directory.set(key, existing ? mergeRecords(existing, record) : record)
  }
  return directory
}

function mergeRecords(
  existing: TelegramTopicRecord,
  incoming: TelegramTopicRecord,
): TelegramTopicRecord {
  return {
    chatId: existing.chatId,
    topicId: existing.topicId,
    groupName: incoming.groupName || existing.groupName,
    title: incoming.title || existing.title,
    sessionId: incoming.sessionId || existing.sessionId,
    sessionKey: incoming.sessionKey || existing.sessionKey,
    createdAt:
      existing.createdAt && incoming.createdAt
        ? Math.min(existing.createdAt, incoming.createdAt)
        : existing.createdAt || incoming.createdAt,
    updatedAt: Math.max(existing.updatedAt, incoming.updatedAt),
  }
}

function writeTopicDirectory(directory: Map<string, TelegramTopicRecord>): void {
  const path = topicDirectoryFilePath()
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(
    tmp,
    JSON.stringify(Array.from(directory.values()), null, 2),
    'utf8',
  )
  renameSync(tmp, path)
}

/**
 * Records topics we have observed. Additive: known topics are enriched,
 * unknown topics are added, and nothing is ever removed here.
 */
export function rememberTopics(
  observations: Array<TelegramTopicObservation>,
): Map<string, TelegramTopicRecord> {
  const directory = readTopicDirectory()
  let changed = false

  for (const observation of observations) {
    const chatId = normalizeChatId(observation.chatId)
    if (!chatId) continue
    const topicId = normalizeTopicId(observation.topicId)
    const key = topicKey(chatId, topicId)
    const observedAt = finiteNumber(observation.observedAt)
    const incoming: TelegramTopicRecord = {
      chatId,
      topicId,
      groupName: clean(observation.groupName),
      title: clean(observation.title),
      sessionId: clean(observation.sessionId),
      sessionKey:
        clean(observation.sessionKey) || telegramSessionKey(chatId, topicId),
      createdAt: observedAt,
      updatedAt: observedAt,
    }
    const existing = directory.get(key)
    const merged = existing ? mergeRecords(existing, incoming) : incoming
    if (!existing || !sameRecord(existing, merged)) {
      directory.set(key, merged)
      changed = true
    }
  }

  if (changed) writeTopicDirectory(directory)
  return directory
}

function sameRecord(a: TelegramTopicRecord, b: TelegramTopicRecord): boolean {
  return (
    a.groupName === b.groupName &&
    a.title === b.title &&
    a.sessionId === b.sessionId &&
    a.sessionKey === b.sessionKey &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt
  )
}

/**
 * Removes a topic. This is the only path out of the directory, mirroring
 * tdesktop's `applyTopicDeleted()`, and is called after Telegram confirms a
 * `deleteForumTopic`.
 */
export function forgetTopic(chatId: string, topicId: string): boolean {
  const key = topicKey(chatId, topicId)
  if (!key) return false
  const directory = readTopicDirectory()
  if (!directory.delete(key)) return false
  writeTopicDirectory(directory)
  return true
}

/**
 * Prunes a chat's topics against an authoritative listing from Telegram.
 *
 * This is the one case where absence *is* evidence. `rememberTopics` never
 * removes anything because a page of Hermes session rows proves nothing
 * about what exists in Telegram — but a successful `channels.getForumTopics`
 * enumerates the whole forum, so a topic missing from it has genuinely been
 * deleted. Same conclusion tdesktop reaches in `applyTopicDeleted()`.
 *
 * Only ever call this with a *complete, successful* listing. Passing the
 * empty result of a failed sync would wipe the chat.
 */
export function reconcileChatTopics(
  chatId: string,
  liveTopicIds: Array<string>,
): Array<TelegramTopicRecord> {
  const chat = normalizeChatId(chatId)
  if (!chat) return []
  const live = new Set(liveTopicIds.map((id) => normalizeTopicId(id)))
  if (live.size === 0) return []

  const directory = readTopicDirectory()
  const removed: Array<TelegramTopicRecord> = []
  for (const [key, record] of directory) {
    if (record.chatId !== chat || live.has(record.topicId)) continue
    directory.delete(key)
    removed.push(record)
  }
  if (removed.length > 0) writeTopicDirectory(directory)
  return removed
}

/**
 * Resolves a topic from a gateway session key. Used on the send path so a
 * freshly created topic is routable before any session row mentions it.
 */
export function findTopicBySessionKey(
  sessionKey: string,
): TelegramTopicRecord | null {
  const key = clean(sessionKey)
  if (!key) return null
  return (
    Array.from(readTopicDirectory().values()).find(
      (record) => record.sessionKey === key,
    ) ?? null
  )
}
