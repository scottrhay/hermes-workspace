import { Api } from 'teleproto'
import { getTelegramUserClient } from './telegram-user-client'
import { normalizeChatId, normalizeTopicId } from './telegram-topic-key'
import type { TelegramTopicObservation } from './telegram-topic-directory'

/**
 * Reads a forum's real topic list over MTProto — the thing a bot token
 * cannot do.
 *
 * Pagination follows tdesktop's `Data::Forum::requestTopics()`: page by
 * `(offsetDate, offsetId, offsetTopic)` taken from the last topic returned,
 * and stop when a page comes back empty, short, or fails to advance the
 * offsets. That last guard matters — a server that keeps returning the same
 * final page would otherwise loop forever.
 */

const PAGE_LIMIT = 100
const MAX_TOPICS_PER_CHAT = 1_000
const SYNC_TTL_MS = 60_000

export type ForumTopicRecord = {
  chatId: string
  topicId: string
  title: string
  closed: boolean
  hidden: boolean
  unreadCount: number
  updatedAt: number
}

type CacheEntry = { topics: Array<ForumTopicRecord>; expiresAt: number }

const cache = new Map<string, CacheEntry>()

/** Test seam — clears the per-chat memo. */
export function resetForumSyncCache(): void {
  cache.clear()
}

function toRecord(
  chatId: string,
  topic: Api.TypeForumTopic,
): ForumTopicRecord | null {
  // `forumTopicDeleted` carries only an id; skip it rather than record a
  // nameless topic. Deletions are applied by the caller diffing ids.
  if (!(topic instanceof Api.ForumTopic)) return null
  const title = typeof topic.title === 'string' ? topic.title.trim() : ''
  return {
    chatId,
    topicId: normalizeTopicId(topic.id),
    title,
    closed: topic.closed === true,
    hidden: topic.hidden === true,
    unreadCount:
      typeof topic.unreadCount === 'number' && Number.isFinite(topic.unreadCount)
        ? topic.unreadCount
        : 0,
    updatedAt:
      typeof topic.date === 'number' && Number.isFinite(topic.date)
        ? topic.date * 1000
        : 0,
  }
}

/**
 * Lists every topic in one forum.
 *
 * Returns `null` — never an empty array — when no user session is configured
 * or the listing failed. Callers use that distinction to decide whether the
 * result is authoritative enough to prune deleted topics against; an empty
 * array means "this forum genuinely has no topics", which is a very
 * different claim from "I could not ask".
 */
export async function listForumTopics(
  chatId: string,
  options: { refresh?: boolean } = {},
): Promise<Array<ForumTopicRecord> | null> {
  const chat = normalizeChatId(chatId)
  if (!chat) return null

  const now = Date.now()
  const cached = cache.get(chat)
  if (!options.refresh && cached && cached.expiresAt > now) return cached.topics

  const client = await getTelegramUserClient()
  if (!client) return null

  const topics: Array<ForumTopicRecord> = []
  const seen = new Set<string>()
  let offsetDate = 0
  let offsetId = 0
  let offsetTopic = 0

  try {
    const entity = await client.getEntity(chat)
    while (topics.length < MAX_TOPICS_PER_CHAT) {
      const page = await client.getForumTopics(entity, {
        offsetDate,
        offsetId,
        offsetTopic,
        limit: PAGE_LIMIT,
      })
      const batch = page.topics
      if (batch.length === 0) break

      let advanced = false
      for (const raw of batch) {
        const record = toRecord(chat, raw)
        if (!record || seen.has(record.topicId)) continue
        seen.add(record.topicId)
        topics.push(record)
        advanced = true
      }

      const last = batch.at(-1)
      const nextTopic =
        last instanceof Api.ForumTopic ? last.id : Number(offsetTopic)
      const nextId =
        last instanceof Api.ForumTopic ? last.topMessage : Number(offsetId)
      const nextDate =
        last instanceof Api.ForumTopic ? last.date : Number(offsetDate)

      // Stop when the server stops moving us forward, not only when a page
      // is short — otherwise a repeated final page loops.
      if (
        !advanced ||
        batch.length < PAGE_LIMIT ||
        (nextTopic === offsetTopic && nextId === offsetId)
      ) {
        break
      }
      offsetTopic = nextTopic
      offsetId = nextId
      offsetDate = nextDate
    }
  } catch (error) {
    console.error(
      `[telegram-forum-sync] Topic listing failed for ${chat}`,
      error instanceof Error ? error.message : error,
    )
    // Serve a stale page rather than blanking the group's topics. A stale
    // listing is still authoritative about which topics existed; a null is
    // not, and must not be used to prune.
    return cached?.topics ?? null
  }

  cache.set(chat, { topics, expiresAt: now + SYNC_TTL_MS })
  return topics
}

/**
 * Converts real Telegram topics into directory observations.
 *
 * `title` here is Telegram's own topic name — the authoritative value the
 * workspace has never had before. `groupName` is left unset: the chat title
 * is resolved separately and per-chat, not per-topic.
 */
export function toTopicObservations(
  topics: Array<ForumTopicRecord>,
): Array<TelegramTopicObservation> {
  return topics
    .filter((topic) => topic.title)
    .map((topic) => ({
      chatId: topic.chatId,
      topicId: topic.topicId,
      title: topic.title,
      observedAt: topic.updatedAt || Date.now(),
    }))
}

/**
 * Lists topics across several forums. The returned map contains only chats
 * that synced successfully, so its entries are safe to reconcile against —
 * a chat that failed is simply absent rather than present-and-empty.
 */
export async function listForumTopicsForChats(
  chatIds: Array<string>,
  options: { refresh?: boolean } = {},
): Promise<Map<string, Array<ForumTopicRecord>>> {
  const synced = new Map<string, Array<ForumTopicRecord>>()
  const unique = Array.from(new Set(chatIds.map(normalizeChatId))).filter(Boolean)
  if (unique.length === 0) return synced

  const pages = await Promise.all(
    unique.map(async (chatId) => ({
      chatId,
      topics: await listForumTopics(chatId, options),
    })),
  )
  for (const { chatId, topics } of pages) {
    if (topics !== null) synced.set(chatId, topics)
  }
  return synced
}
