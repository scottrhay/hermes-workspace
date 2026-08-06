import { telegramApi } from './telegram-forum-topics'
import { normalizeChatId } from './telegram-topic-key'

/**
 * Authoritative group names, read from Telegram rather than inferred.
 *
 * `getChat` is the only forum metadata a bot can actually read back — it
 * returns the chat `title` and the `is_forum` flag. Before this, group names
 * came from whatever `display_name` / `origin_json.chat_name` happened to be
 * on a Hermes session row, which is why groups fell back to the literal
 * placeholder "Telegram Group".
 *
 * Results are memoized because the workstream list polls every 10s and group
 * titles change roughly never. Failures are cached as misses for a shorter
 * window so a transient outage does not pin a group to its fallback name.
 */
export type TelegramChatInfo = {
  chatId: string
  title: string
  isForum: boolean
}

const HIT_TTL_MS = 5 * 60_000
const MISS_TTL_MS = 30_000

type CacheEntry = { info: TelegramChatInfo | null; expiresAt: number }

const cache = new Map<string, CacheEntry>()

/** Test seam — clears the memo so specs do not leak state into each other. */
export function resetTelegramChatInfoCache(): void {
  cache.clear()
}

async function fetchChatInfo(
  chatId: string,
  token: string,
  now: number,
): Promise<TelegramChatInfo | null> {
  try {
    const result = await telegramApi<{ title?: string; is_forum?: boolean }>(
      'getChat',
      token,
      { chat_id: chatId },
    )
    const title = typeof result.title === 'string' ? result.title.trim() : ''
    const info: TelegramChatInfo = {
      chatId,
      title,
      isForum: result.is_forum === true,
    }
    cache.set(chatId, { info, expiresAt: now + HIT_TTL_MS })
    return info
  } catch {
    // Never throw: an unreachable Telegram must degrade the group name, not
    // take down the workstream list.
    cache.set(chatId, { info: null, expiresAt: now + MISS_TTL_MS })
    return null
  }
}

/**
 * Resolves `chatId -> title` for the given chats. Returns an empty map when
 * no bot token is configured, so callers keep their existing fallbacks.
 */
export async function fetchTelegramGroupTitles(
  chatIds: Array<string>,
  token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '',
): Promise<Record<string, string>> {
  const titles: Record<string, string> = {}
  if (!token) return titles

  const now = Date.now()
  const pending: Array<string> = []
  for (const rawChatId of new Set(chatIds.map(normalizeChatId))) {
    if (!rawChatId) continue
    const cached = cache.get(rawChatId)
    if (cached && cached.expiresAt > now) {
      if (cached.info?.title) titles[rawChatId] = cached.info.title
      continue
    }
    pending.push(rawChatId)
  }

  const fetched = await Promise.all(
    pending.map((chatId) => fetchChatInfo(chatId, token, now)),
  )
  for (const info of fetched) {
    if (info?.title) titles[info.chatId] = info.title
  }
  return titles
}
