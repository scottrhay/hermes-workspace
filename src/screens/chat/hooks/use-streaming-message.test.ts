import { describe, expect, it } from 'vitest'
import {
  parseStreamRequestError,
  shouldResolveStreamSession,
} from './use-streaming-message'

describe('shouldResolveStreamSession', () => {
  it('does not promote backend api session ids over concrete Workspace sessions', () => {
    expect(
      shouldResolveStreamSession({
        requestedSessionKey: 'api-original-workspace',
        currentSessionKey: 'api-original-workspace',
        resolvedSessionKey: 'api-derived-backend',
      }),
    ).toBe(false)
  })

  it('allows bootstrap new chats to resolve once to a concrete session', () => {
    expect(
      shouldResolveStreamSession({
        requestedSessionKey: 'new',
        currentSessionKey: 'new',
        resolvedSessionKey: 'api-created-session',
      }),
    ).toBe(true)
  })

  it('keeps portable main chats pinned instead of promoting a backend session id', () => {
    expect(
      shouldResolveStreamSession({
        requestedSessionKey: 'main',
        currentSessionKey: 'main',
        resolvedSessionKey: 'existing-main-session',
        pinMainSession: true,
      }),
    ).toBe(false)
  })

  it('still resolves main chats when the route is not pinned to a portable session', () => {
    expect(
      shouldResolveStreamSession({
        requestedSessionKey: 'main',
        currentSessionKey: 'main',
        resolvedSessionKey: 'existing-main-session',
        pinMainSession: false,
      }),
    ).toBe(true)
  })
})

describe('parseStreamRequestError', () => {
  it('returns the server-provided safe error field', () => {
    expect(
      parseStreamRequestError(
        JSON.stringify({
          ok: false,
          error:
            'Telegram workstream session does not match the selected topic. Reopen it from the selector and retry.',
        }),
      ),
    ).toBe(
      'Telegram workstream session does not match the selected topic. Reopen it from the selector and retry.',
    )
  })

  it('does not expose raw proxy or server response bodies', () => {
    expect(parseStreamRequestError('proxy diagnostic: bearer secret')).toBe(
      'Stream request failed',
    )
    expect(
      parseStreamRequestError(JSON.stringify({ detail: 'internal path' })),
    ).toBe('Stream request failed')
    expect(
      parseStreamRequestError(
        JSON.stringify({ error: 'OPAQUE_PROXY_DIAGNOSTIC_91ac' }),
      ),
    ).toBe('Stream request failed')
  })
})
