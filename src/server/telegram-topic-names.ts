import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getStateDir } from './workspace-state-dir'
import { topicKey } from './telegram-topic-key'

const NAME_MAX = 128

/**
 * A saved topic name.
 *
 * `source` records who last agreed on the name. Telegram is authoritative
 * for topic titles — tdesktop and tweb both treat the server's name as truth
 * and mirror it locally via `messageActionTopicEdit` — so a purely local
 * override is a *fallback*, used only while Telegram has told us nothing.
 * Once a rename is pushed and accepted, `source` becomes `telegram`: the
 * name now matches the server, so it can outrank an older observation
 * without ever pinning the topic to a stale title.
 */
export type TopicNameRecord = {
  name: string
  source: 'local' | 'telegram'
  updatedAt: number
}

export function topicNameOverridesFilePath(): string {
  return join(getStateDir(), 'telegram-topic-names.json')
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toRecord(value: unknown): TopicNameRecord | null {
  // Legacy shape: a bare string with no provenance. Treat it as an
  // unconfirmed local fallback dated to the epoch so any name Telegram
  // reports wins — that is the repair for overrides that had permanently
  // masked a topic renamed in the Telegram app.
  if (typeof value === 'string') {
    const name = value.trim()
    return name ? { name, source: 'local', updatedAt: 0 } : null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const name = clean(raw.name)
  if (!name) return null
  return {
    name,
    source: raw.source === 'telegram' ? 'telegram' : 'local',
    updatedAt:
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : 0,
  }
}

/**
 * Reads saved Telegram topic names, keyed by `topicKey` (`chatId:topicId`).
 * Missing or corrupt files return an empty map.
 */
export function readTopicNameOverrides(): Record<string, TopicNameRecord> {
  const path = topicNameOverridesFilePath()
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, TopicNameRecord> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const record = toRecord(value)
      if (record) out[key] = record
    }
    return out
  } catch {
    return {}
  }
}

function writeOverrides(overrides: Record<string, TopicNameRecord>): void {
  const path = topicNameOverridesFilePath()
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(overrides, null, 2), 'utf8')
  renameSync(tmp, path)
}

/**
 * Saves a topic name. Throws on invalid input; callers should map that to a
 * 400 response.
 */
export function setTopicNameOverride(
  chatId: string,
  topicId: string,
  name: string,
  source: TopicNameRecord['source'] = 'local',
  now: number = Date.now(),
): void {
  const cleanName = name.trim()
  if (!clean(chatId)) throw new Error('chatId is required')
  if (!clean(topicId)) throw new Error('topicId is required')
  if (!cleanName) throw new Error('name is required')
  if (cleanName.length > NAME_MAX) {
    throw new Error(`name must be ${NAME_MAX} characters or fewer`)
  }

  const overrides = readTopicNameOverrides()
  overrides[topicKey(chatId, topicId)] = {
    name: cleanName,
    source,
    updatedAt: now,
  }
  writeOverrides(overrides)
}

/**
 * Marks a saved name as matching Telegram's, after `editForumTopic` (or
 * `createForumTopic`) accepted it.
 */
export function confirmTopicNameFromTelegram(
  chatId: string,
  topicId: string,
  name: string,
  now: number = Date.now(),
): void {
  setTopicNameOverride(chatId, topicId, name, 'telegram', now)
}

/**
 * Resolves the name to display for a topic.
 *
 * Telegram's reported name wins, because Telegram owns topic titles. A saved
 * name only takes precedence when we pushed it to Telegram successfully
 * (`source: 'telegram'`) *and* it is at least as recent as the observation
 * we are comparing against — otherwise a rename made in the Telegram app
 * could never reach the workspace.
 */
export function resolveTopicName(
  record: TopicNameRecord | undefined,
  telegramName: string,
  telegramObservedAt: number,
  fallbacks: Array<string> = [],
): string {
  const reported = clean(telegramName)
  if (
    record &&
    record.source === 'telegram' &&
    record.updatedAt >= telegramObservedAt
  ) {
    return record.name
  }
  if (reported) return reported
  if (record) return record.name
  return fallbacks.map(clean).find(Boolean) ?? ''
}

export type TelegramPushResult =
  | { status: 'skipped' }
  | { status: 'unavailable' }
  | { status: 'renamed' }
  | { status: 'failed'; telegramError: string }

/**
 * Pushes a topic rename to Telegram via the Bot API's `editForumTopic`.
 * Never throws — a failed push is reported in the result, not as an
 * exception, so the caller can still report the already-saved name.
 * Never includes the bot token in any returned message.
 */
export async function pushTelegramTopicRename(
  chatId: string,
  topicId: string,
  name: string,
  pushToTelegram: boolean,
): Promise<TelegramPushResult> {
  if (!pushToTelegram) return { status: 'skipped' }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) return { status: 'unavailable' }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/editForumTopic`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_thread_id: Number(topicId),
          name,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    )
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean
      description?: string
    }
    if (payload.ok === true) return { status: 'renamed' }
    // Telegram rejects renames that match the current name; the topic already
    // has the requested name, so treat it as success.
    if (payload.description?.includes('TOPIC_NOT_MODIFIED')) {
      return { status: 'renamed' }
    }
    return {
      status: 'failed',
      telegramError:
        payload.description || `Telegram API request failed (${response.status})`,
    }
  } catch {
    return { status: 'failed', telegramError: 'Network error contacting Telegram' }
  }
}
