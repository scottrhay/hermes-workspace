import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getStateDir } from './workspace-state-dir'

const NAME_MAX = 128

export function topicNameOverridesFilePath(): string {
  return join(getStateDir(), 'telegram-topic-names.json')
}

/**
 * Reads the user-saved Telegram topic name overrides, keyed by
 * `${chatId}:${topicId}`. Missing or corrupt files return an empty map.
 */
export function readTopicNameOverrides(): Record<string, string> {
  const path = topicNameOverridesFilePath()
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Saves a user override for a Telegram topic's display name. Throws on
 * invalid input; callers should map that to a 400 response.
 */
export function setTopicNameOverride(
  chatId: string,
  topicId: string,
  name: string,
): void {
  const cleanChatId = chatId.trim()
  const cleanTopicId = topicId.trim()
  const cleanName = name.trim()
  if (!cleanChatId) throw new Error('chatId is required')
  if (!cleanTopicId) throw new Error('topicId is required')
  if (!cleanName) throw new Error('name is required')
  if (cleanName.length > NAME_MAX) {
    throw new Error(`name must be ${NAME_MAX} characters or fewer`)
  }

  const overrides = readTopicNameOverrides()
  overrides[`${cleanChatId}:${cleanTopicId}`] = cleanName

  const path = topicNameOverridesFilePath()
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(overrides, null, 2), 'utf8')
  renameSync(tmp, path)
}

export type TelegramPushResult =
  | { status: 'skipped' }
  | { status: 'unavailable' }
  | { status: 'renamed' }
  | { status: 'failed'; telegramError: string }

/**
 * Pushes a topic rename to Telegram via the Bot API's `editForumTopic`.
 * Never throws — a failed push is reported in the result, not as an
 * exception, so the caller can still report the already-saved override.
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
