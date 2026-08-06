import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  createSession,
  ensureGatewayProbed,
  getGatewayCapabilities,
} from '../../server/claude-api'
import {
  readTopicDirectory,
  rememberTopics,
} from '../../server/telegram-topic-directory'
import { normalizeChatId, normalizeTopicId, telegramSessionKey } from '../../server/telegram-topic-key'

/**
 * Binds a Hermes session to a Telegram topic that does not have one yet.
 *
 * Enumeration surfaces every topic in a forum, including ones created in the
 * Telegram app that the workspace has never seen a message for. Those have no
 * Hermes session, so there is nothing to open until one is created — this is
 * the "+ New topic" flow minus `createForumTopic`, since the topic already
 * exists in Telegram.
 *
 * The topic must already be in the directory, which means Telegram told us
 * about it. That keeps this from being a way to mint sessions against
 * arbitrary chat/topic pairs.
 */
export const Route = createFileRoute('/api/telegram-topic-bind')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
        if (!contentType.startsWith('application/json')) {
          return json(
            { ok: false, error: 'Content-Type must be application/json' },
            { status: 415 },
          )
        }

        const body = (await request.json().catch(() => null)) as
          | Record<string, unknown>
          | null
        const chatId = normalizeChatId(body?.chatId)
        const topicId = normalizeTopicId(body?.topicId)
        if (!chatId) {
          return json(
            { ok: false, error: 'chatId and topicId are required' },
            { status: 400 },
          )
        }

        const known = readTopicDirectory().get(`${chatId}:${topicId}`)
        if (!known) {
          return json(
            { ok: false, error: 'Telegram topic was not found' },
            { status: 404 },
          )
        }
        // Already bound — hand back the existing session rather than opening
        // a second one for the same topic.
        if (known.sessionId) {
          return json({
            ok: true,
            topic: { ...known, sessionId: known.sessionId },
          })
        }

        try {
          await ensureGatewayProbed()
          const capabilities = getGatewayCapabilities()
          if (!capabilities.sessions || !capabilities.dashboard.available) {
            return json(
              { ok: false, error: 'Hermes session creation is unavailable' },
              { status: 503 },
            )
          }

          const session = await createSession({
            title: known.title || `Topic ${topicId}`,
          })
          const sessionId = typeof session.id === 'string' ? session.id.trim() : ''
          if (!sessionId) throw new Error('Hermes did not return a session ID')

          const boundAt = Date.now()
          const binding = {
            chatId,
            topicId,
            groupName: known.groupName,
            title: known.title,
            sessionId,
            sessionKey: telegramSessionKey(chatId, topicId),
          }
          rememberTopics([{ ...binding, observedAt: boundAt }])
          return json({ ok: true, topic: { ...binding, createdAt: boundAt } })
        } catch (error) {
          console.error('[telegram-topic-bind] Binding failed', error)
          return json(
            {
              ok: false,
              error: 'Could not open a Hermes session for this Telegram topic',
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
