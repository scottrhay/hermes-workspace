const TELEGRAM_MESSAGE_MAX = 4096
const MIRROR_PREFIX = '🖥️ '

/**
 * Formats a WebUI-sent message for mirroring into a Telegram topic: trims
 * it, prefixes it so it reads as "sent from the WebUI" (distinct from the
 * agent's own replies in the topic), and truncates to Telegram's message
 * limit.
 */
export function formatTelegramMirrorText(text: string): string {
  const prefixed = `${MIRROR_PREFIX}${text.trim()}`
  return prefixed.slice(0, TELEGRAM_MESSAGE_MAX)
}

export type TelegramMirrorResult =
  | { status: 'sent' }
  | { status: 'unavailable' }
  | { status: 'failed'; telegramError: string }

/**
 * Mirrors a WebUI-sent chat message into the originating Telegram topic via
 * the Bot API's `sendMessage`. Never throws — a failed send is reported in
 * the result, not as an exception — and never includes the bot token in any
 * returned message.
 */
export async function mirrorMessageToTelegramTopic(
  chatId: string,
  topicId: string,
  text: string,
): Promise<TelegramMirrorResult> {
  if (!text.trim()) return { status: 'unavailable' }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) return { status: 'unavailable' }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_thread_id: Number(topicId),
          text: formatTelegramMirrorText(text),
        }),
        signal: AbortSignal.timeout(10_000),
      },
    )
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean
      description?: string
    }
    if (payload.ok === true) return { status: 'sent' }
    return {
      status: 'failed',
      telegramError:
        payload.description || `Telegram API request failed (${response.status})`,
    }
  } catch {
    return { status: 'failed', telegramError: 'Network error contacting Telegram' }
  }
}
