import {
  isGeneralTopicId,
  normalizeChatId,
  normalizeTopicId,
  parseTelegramSessionKey,
  telegramSessionKey,
  topicKey,
} from './telegram-topic-key'
import { resolveTopicName } from './telegram-topic-names'
import type { TopicNameRecord } from './telegram-topic-names'
import type {
  TelegramTopicObservation,
  TelegramTopicRecord,
} from './telegram-topic-directory'

export type TelegramSessionRow = {
  id?: string
  source?: string | null
  user_id?: string | null
  session_key?: string | null
  chat_id?: string | null
  chat_type?: string | null
  thread_id?: string | null
  display_name?: string | null
  origin_json?: string | null
  title?: string | null
  started_at?: number | null
  last_active?: number | null
  message_count?: number | null
  is_active?: boolean | null
  preview?: string | null
}

export type TelegramWorkstream = {
  sessionId: string
  sessionKey: string
  groupName: string
  chatId: string
  topicId: string
  title: string
  updatedAt: number
  messageCount: number
  isActive: boolean
  preview: string
}

export type NormalizeTelegramOptions = {
  /** Sticky topic directory, so known topics survive a sparse session page. */
  directory?: Map<string, TelegramTopicRecord> | Array<TelegramTopicRecord>
  /** Authoritative `chatId -> title`, read from Telegram's `getChat`. */
  groupNames?: Record<string, string>
  /**
   * Telegram's General topic is a real topic and is always keyed, so messages
   * that carry no thread reference route correctly. It stays out of the
   * workstream list unless a caller explicitly addresses it.
   */
  includeGeneral?: boolean
  /**
   * `chatId -> live topic ids`, from a successful full `getForumTopics`
   * listing. For those chats the listing is the complete truth, so a topic
   * absent from it is deleted and is dropped even when a Hermes session row
   * still references it — otherwise a deleted topic lingers forever behind
   * its orphaned session.
   *
   * Only ever populate this from a successful sync; a failed one must leave
   * the chat out entirely rather than map it to an empty set.
   */
  liveTopicsByChat?: Map<string, Set<string>>
}

const DEFAULT_GROUP_NAME = 'Telegram Group'

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseOriginJson(originJson: unknown): Record<string, unknown> | null {
  const raw = cleanString(originJson)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function secondsToMilliseconds(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 1000)
    : 0
}

export function getTelegramOwnerUserId(
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    env.AIA_TELEGRAM_OWNER_USER_ID ||
    env.TELEGRAM_OWNER_USER_ID ||
    '8304360654'
  ).trim()
}

function isNewerSession(
  candidate: TelegramSessionRow,
  current: TelegramSessionRow,
): boolean {
  const candidateStarted = candidate.started_at ?? 0
  const currentStarted = current.started_at ?? 0
  if (candidateStarted !== currentStarted) {
    return candidateStarted > currentStarted
  }
  const candidateActive = candidate.last_active ?? 0
  const currentActive = current.last_active ?? 0
  if (candidateActive !== currentActive) return candidateActive > currentActive
  return cleanString(candidate.id).localeCompare(cleanString(current.id)) > 0
}

/**
 * The topic a row addresses, or null when it addresses none.
 *
 * `(chatId, topicId)` is the identity wherever we can derive a chat. When we
 * cannot, the row's own `session_key` stands in — Hermes already issues one
 * stable key per topic, so de-duplication still holds and the workstream
 * stays visible instead of disappearing. Its empty `chatId` correctly leaves
 * rename and mirror unavailable, since neither can address a chat we cannot
 * name.
 */
function rowTopicIdentity(
  row: TelegramSessionRow,
  ownerUserId: string,
): { chatId: string; topicId: string; key: string } | null {
  if (
    cleanString(row.source).toLowerCase() !== 'telegram' ||
    cleanString(row.user_id) !== cleanString(ownerUserId) ||
    !cleanString(row.id)
  ) {
    return null
  }

  const origin = parseOriginJson(row.origin_json)
  // A session key already encodes the pair, so it is the most reliable
  // source; fall back to the row's own columns, then to origin metadata.
  const fromKey = parseTelegramSessionKey(row.session_key)
  const chatId =
    fromKey?.chatId ||
    normalizeChatId(row.chat_id) ||
    normalizeChatId(origin?.chat_id)
  const topicId = fromKey
    ? fromKey.topicId
    : normalizeTopicId(row.thread_id ?? origin?.chat_topic_id)

  const key = chatId ? topicKey(chatId, topicId) : cleanString(row.session_key)
  if (!key) return null
  return { chatId, topicId, key }
}

function toNameRecord(
  value: TopicNameRecord | string | undefined,
): TopicNameRecord | undefined {
  if (typeof value === 'string') {
    const name = value.trim()
    return name ? { name, source: 'local', updatedAt: 0 } : undefined
  }
  return value
}

function asDirectoryArray(
  directory: NormalizeTelegramOptions['directory'],
): Array<TelegramTopicRecord> {
  if (!directory) return []
  return Array.isArray(directory) ? directory : Array.from(directory.values())
}

/**
 * Builds the workstream list keyed by `(chatId, topicId)`.
 *
 * Identity comes from the topic, not from a Hermes session: sessions
 * *attach* to a topic. A topic with two sessions collapses to one entry
 * (newest session wins) instead of appearing twice, and a topic the
 * directory knows about still renders when no session row mentions it.
 */
export function normalizeTelegramWorkstreams(
  rows: Array<TelegramSessionRow>,
  ownerUserId: string,
  topicNames: Record<string, TopicNameRecord | string> = {},
  options: NormalizeTelegramOptions = {},
): Array<TelegramWorkstream> {
  const owner = cleanString(ownerUserId)
  const newestByTopic = new Map<string, TelegramSessionRow>()
  const identityByTopic = new Map<string, { chatId: string; topicId: string }>()
  const groupNameByChatId = new Map<string, string>()
  const groupNameByKey = new Map<string, string>()

  for (const row of rows) {
    const identity = rowTopicIdentity(row, owner)
    if (!identity) continue

    const origin = parseOriginJson(row.origin_json)
    const groupName =
      cleanString(row.display_name) || cleanString(origin?.chat_name)
    if (groupName) {
      if (!groupNameByKey.has(identity.key)) {
        groupNameByKey.set(identity.key, groupName)
      }
      if (identity.chatId && !groupNameByChatId.has(identity.chatId)) {
        groupNameByChatId.set(identity.chatId, groupName)
      }
    }

    identityByTopic.set(identity.key, {
      chatId: identity.chatId,
      topicId: identity.topicId,
    })
    const existing = newestByTopic.get(identity.key)
    if (!existing || isNewerSession(row, existing)) {
      newestByTopic.set(identity.key, row)
    }
  }

  const directory = new Map(
    asDirectoryArray(options.directory).map((record) => [
      topicKey(record.chatId, record.topicId),
      record,
    ]),
  )
  for (const [key, record] of directory) {
    if (!key) continue
    if (!identityByTopic.has(key)) {
      identityByTopic.set(key, {
        chatId: record.chatId,
        topicId: record.topicId,
      })
    }
    if (record.groupName && !groupNameByChatId.has(record.chatId)) {
      groupNameByChatId.set(record.chatId, record.groupName)
    }
  }

  const workstreams: Array<TelegramWorkstream> = []
  for (const [key, identity] of identityByTopic) {
    if (!options.includeGeneral && isGeneralTopicId(identity.topicId)) continue

    // For a fully enumerated chat, Telegram's listing is the complete set of
    // topics. Anything else we hold for that chat has been deleted there.
    const live = options.liveTopicsByChat?.get(identity.chatId)
    if (live && !live.has(identity.topicId)) continue

    const row = newestByTopic.get(key)
    const record = directory.get(key)
    const origin = parseOriginJson(row?.origin_json)
    const updatedAt = row
      ? secondsToMilliseconds(row.last_active ?? row.started_at)
      : (record?.updatedAt ?? 0)

    workstreams.push({
      sessionId: cleanString(row?.id) || cleanString(record?.sessionId),
      sessionKey:
        cleanString(row?.session_key) ||
        cleanString(record?.sessionKey) ||
        telegramSessionKey(identity.chatId, identity.topicId),
      groupName:
        cleanString(options.groupNames?.[identity.chatId]) ||
        cleanString(row?.display_name) ||
        cleanString(origin?.chat_name) ||
        groupNameByKey.get(key) ||
        groupNameByChatId.get(identity.chatId) ||
        cleanString(record?.groupName) ||
        DEFAULT_GROUP_NAME,
      chatId: identity.chatId,
      topicId: identity.topicId,
      // The directory only ever holds names Telegram gave us (an MTProto
      // topic listing, or a create/rename we pushed), so it counts as a
      // Telegram-reported name rather than a mere fallback. `row.title` is
      // the Hermes session's own LLM title and stays a last resort.
      title: resolveTopicName(
        toNameRecord(topicNames[key]),
        cleanString(origin?.chat_topic) || cleanString(record?.title),
        cleanString(origin?.chat_topic) ? updatedAt : (record?.updatedAt ?? 0),
        [cleanString(row?.title), `Topic ${identity.topicId}`],
      ),
      updatedAt,
      messageCount:
        typeof row?.message_count === 'number' &&
        Number.isFinite(row.message_count)
          ? row.message_count
          : 0,
      isActive: row?.is_active === true,
      preview: cleanString(row?.preview),
    })
  }

  return workstreams.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Distills session rows into topic observations for the sticky directory, so
 * a topic stays known once seen even if later session pages omit it.
 */
export function telegramTopicObservations(
  rows: Array<TelegramSessionRow>,
  ownerUserId: string,
): Array<TelegramTopicObservation> {
  const owner = cleanString(ownerUserId)
  const observations = new Map<string, TelegramTopicObservation>()

  for (const row of rows) {
    const identity = rowTopicIdentity(row, owner)
    if (!identity) continue
    const origin = parseOriginJson(row.origin_json)
    const observedAt = secondsToMilliseconds(row.last_active ?? row.started_at)
    const existing = observations.get(identity.key)
    if (existing && (existing.observedAt ?? 0) >= observedAt) continue

    observations.set(identity.key, {
      chatId: identity.chatId,
      topicId: identity.topicId,
      groupName:
        cleanString(row.display_name) || cleanString(origin?.chat_name),
      // Only ever record a name Telegram told us. `row.title` is the Hermes
      // session's own LLM-generated title, which drifts as the conversation
      // evolves and is replaced outright when a session resets — recording it
      // here would let it overwrite the topic's real name. It stays available
      // as a display fallback, but it is not the topic's identity.
      title: cleanString(origin?.chat_topic),
      sessionId: cleanString(row.id),
      sessionKey:
        cleanString(row.session_key) ||
        telegramSessionKey(identity.chatId, identity.topicId),
      observedAt,
    })
  }

  return Array.from(observations.values())
}

/**
 * Resolves an explicitly addressed topic. General is included here: it is
 * hidden from the list, not unroutable, so a message that carries no thread
 * reference still reaches the right place.
 */
export function resolveAuthorizedTelegramWorkstream(
  rows: Array<TelegramSessionRow>,
  sessionKey: string,
  ownerUserId: string,
  options: NormalizeTelegramOptions = {},
): TelegramWorkstream | null {
  const key = cleanString(sessionKey)
  if (!key) return null
  return (
    normalizeTelegramWorkstreams(rows, ownerUserId, {}, {
      ...options,
      includeGeneral: true,
    }).find((workstream) => workstream.sessionKey === key) ?? null
  )
}

/**
 * Confirms a concrete Hermes session really belongs to the addressed topic.
 * Matches the row's own session key or the key its `(chatId, topicId)`
 * implies, so a row that predates the stable-key convention still authorizes.
 */
export function isAuthorizedTelegramSessionPair(
  rows: Array<TelegramSessionRow>,
  sessionKey: string,
  concreteSessionId: string,
  ownerUserId: string,
): boolean {
  const key = cleanString(sessionKey)
  const sessionId = cleanString(concreteSessionId)
  const owner = cleanString(ownerUserId)
  if (!key || !sessionId || !owner) return false

  return rows.some((row) => {
    if (cleanString(row.id) !== sessionId) return false
    const identity = rowTopicIdentity(row, owner)
    if (!identity) return false
    return (
      cleanString(row.session_key) === key ||
      telegramSessionKey(identity.chatId, identity.topicId) === key
    )
  })
}

const SENDER_PREFIX_RE = /^\[[^\]\n]{1,64}\]\s+/

/**
 * Strips a leading `[Sender Name] ` tag that the Hermes gateway bakes into
 * inbound Telegram group messages. Only the first prefix is removed; the
 * rest of the text (including any further bracketed tags) is left as-is.
 */
export function stripTelegramSenderPrefix(text: string): string {
  return text.replace(SENDER_PREFIX_RE, '')
}

export function publicTelegramToolFailure(
  gatewaySessionKey: string | undefined,
  upstreamMessage: string,
): string {
  return cleanString(gatewaySessionKey)
    ? 'Tool failed. Retry shortly.'
    : cleanString(upstreamMessage)
}

export function publicTelegramStreamFailure(
  gatewaySessionKey: string | undefined,
  upstreamMessage: string,
): string {
  return cleanString(gatewaySessionKey)
    ? 'Hermes response failed. Retry shortly.'
    : cleanString(upstreamMessage)
}

export function publicTelegramToolEvent<
  T extends { phase?: string; result?: string },
>(gatewaySessionKey: string | undefined, event: T): T {
  if (event.phase !== 'error' || !cleanString(gatewaySessionKey)) return event
  return {
    ...event,
    result: publicTelegramToolFailure(gatewaySessionKey, event.result ?? ''),
  }
}
