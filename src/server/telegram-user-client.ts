import { TelegramClient, sessions } from 'teleproto'

/**
 * The MTProto user client — the workspace talking to Telegram *as Scott*,
 * the same way Telegram Desktop does.
 *
 * This exists because a bot token cannot list forum topics: the Bot API has
 * no `getForumTopics`, so a bot only ever learns about a topic it created or
 * was spoken to in. `channels.getForumTopics` is MTProto-only and available
 * to user sessions, which is how tdesktop and tweb enumerate a forum.
 *
 * Entirely optional. With no session configured every entry point here
 * reports "unavailable" and the workspace falls back to its bot-token-only
 * behaviour, so this never becomes a hard dependency.
 */

let clientPromise: Promise<TelegramClient | null> | null = null

export type TelegramUserClientStatus =
  | { available: true }
  | { available: false; reason: 'unconfigured' | 'failed' }

function readConfig(): { apiId: number; apiHash: string; session: string } | null {
  const apiId = Number(process.env.TELEGRAM_API_ID?.trim() ?? '')
  const apiHash = process.env.TELEGRAM_API_HASH?.trim() ?? ''
  const session = process.env.TELEGRAM_USER_SESSION?.trim() ?? ''
  if (!Number.isInteger(apiId) || apiId <= 0 || !apiHash || !session) return null
  return { apiId, apiHash, session }
}

/** True when a user session is configured. Does not attempt to connect. */
export function isTelegramUserClientConfigured(): boolean {
  return readConfig() !== null
}

/**
 * Returns a connected client, or null when unconfigured or unreachable.
 * Never throws — callers degrade to bot-only behaviour instead.
 */
export async function getTelegramUserClient(): Promise<TelegramClient | null> {
  const config = readConfig()
  if (!config) return null

  clientPromise ??= (async () => {
    try {
      const client = new TelegramClient(
        new sessions.StringSession(config.session),
        config.apiId,
        config.apiHash,
        {
          connectionRetries: 2,
          // The workspace is a poller, not a live client; keep it quiet.
          autoReconnect: true,
          baseLogger: undefined,
        },
      )
      await client.connect()
      if (!(await client.isUserAuthorized())) {
        console.error(
          '[telegram-user-client] Session is no longer authorized — re-run `pnpm telegram:login`',
        )
        await client.disconnect().catch(() => undefined)
        return null
      }
      return client
    } catch (error) {
      console.error(
        '[telegram-user-client] Connection failed',
        error instanceof Error ? error.message : error,
      )
      return null
    }
  })()

  const client = await clientPromise
  // A failed attempt must not poison every later call; allow a retry on the
  // next poll rather than pinning the workspace to bot-only for the process
  // lifetime.
  if (!client) clientPromise = null
  return client
}

/** Test seam / shutdown hook. */
export async function disconnectTelegramUserClient(): Promise<void> {
  const pending = clientPromise
  clientPromise = null
  if (!pending) return
  const client = await pending.catch(() => null)
  await client?.disconnect().catch(() => undefined)
}
