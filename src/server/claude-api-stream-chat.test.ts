import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamChat, submitSession } from './claude-api'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('streamChat Telegram continuity', () => {
  it('forwards the stable Hermes session key as an authenticated server header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('data: [DONE]\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await streamChat(
      'concrete-session-id',
      { message: 'continue this workstream' },
      {
        gatewaySessionKey: 'agent:main:telegram:group:g1:2246',
        onEvent: vi.fn(),
      },
    )

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/sessions/concrete-session-id/chat/stream'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Hermes-Session-Key': 'agent:main:telegram:group:g1:2246',
        }),
      }),
    )
  })
})

describe('submitSession Telegram continuity', () => {
  it('targets the exact concrete session and stable canonical gateway lane', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, status: 'accepted' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      submitSession(
        'concrete-session-id',
        'authorization code entered in WebUI',
        'agent:main:telegram:group:g1:2246',
      ),
    ).resolves.toEqual({ ok: true, status: 'accepted' })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/sessions/concrete-session-id/submit'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Hermes-Session-Key': 'agent:main:telegram:group:g1:2246',
        }),
        body: JSON.stringify({
          message: 'authorization code entered in WebUI',
        }),
      }),
    )
  })
})
