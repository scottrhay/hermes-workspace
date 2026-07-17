import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamChat } from './claude-api'

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
