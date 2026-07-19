import { afterEach, describe, expect, it, vi } from 'vitest'
import { steerSession, streamChat } from './claude-api'

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

describe('steerSession Telegram continuity', () => {
  it('targets the exact concrete session and stable gateway key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, status: 'steered' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      steerSession(
        'concrete-session-id',
        'authorization code entered in WebUI',
        'agent:main:telegram:group:g1:2246',
      ),
    ).resolves.toEqual({ ok: true, status: 'steered' })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/sessions/concrete-session-id/steer'),
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

  it('exposes a typed 409 so only the no-active-run race can fall through', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'session_not_active',
              message: 'No matching active gateway run',
            },
          }),
          { status: 409 },
        ),
      ),
    )

    await expect(
      steerSession(
        'concrete-session-id',
        'start a normal turn if idle',
        'agent:main:telegram:group:g1:2246',
      ),
    ).rejects.toMatchObject({ status: 409, code: 'session_not_active' })
  })
})
