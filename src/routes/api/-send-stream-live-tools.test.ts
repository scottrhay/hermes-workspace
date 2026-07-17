import { describe, expect, it } from 'vitest'

import { publicTelegramToolEvent } from '../../server/telegram-workstreams'
import {
  collectSyntheticLiveToolEvents,
  createSyntheticLiveToolTracker,
} from './-send-stream-live-tools'

describe('collectSyntheticLiveToolEvents', () => {
  it('emits a live calling event as soon as an assistant tool call appears, before any tool result exists', () => {
    const tracker = createSyntheticLiveToolTracker()

    const events = collectSyntheticLiveToolEvents({
      messages: [
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'toolu_1',
              function: {
                name: 'read_file',
                arguments: '{"path":"/tmp/AGENTS.md"}',
              },
            },
          ],
        },
      ],
      tracker,
      sessionKey: 'session-1',
      runId: 'run-1',
    })

    expect(events).toEqual([
      {
        phase: 'calling',
        name: 'read_file',
        toolCallId: 'toolu_1',
        args: { path: '/tmp/AGENTS.md' },
        result: undefined,
        sessionKey: 'session-1',
        runId: 'run-1',
      },
    ])
  })

  it('upgrades the same live tool card to complete when the matching tool result lands', () => {
    const tracker = createSyntheticLiveToolTracker()

    collectSyntheticLiveToolEvents({
      messages: [
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'toolu_1',
              function: {
                name: 'read_file',
                arguments: '{"path":"/tmp/AGENTS.md"}',
              },
            },
          ],
        },
      ],
      tracker,
      sessionKey: 'session-1',
      runId: 'run-1',
    })

    const events = collectSyntheticLiveToolEvents({
      messages: [
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'toolu_1',
              function: {
                name: 'read_file',
                arguments: '{"path":"/tmp/AGENTS.md"}',
              },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'toolu_1',
          content: [{ type: 'text', text: 'file contents here' }],
        },
      ],
      tracker,
      sessionKey: 'session-1',
      runId: 'run-1',
    })

    expect(events).toEqual([
      {
        phase: 'complete',
        name: 'read_file',
        toolCallId: 'toolu_1',
        args: { path: '/tmp/AGENTS.md' },
        result: 'file contents here',
        sessionKey: 'session-1',
        runId: 'run-1',
      },
    ])
  })

  it('keeps opaque synthetic tool errors out of Telegram browser events', () => {
    const diagnostic = 'opaque bearer secret at /internal/path'
    const [synthetic] = collectSyntheticLiveToolEvents({
      messages: [
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'toolu_error',
              function: { name: 'terminal', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'toolu_error',
          content: diagnostic,
          is_error: true,
        },
      ],
      tracker: createSyntheticLiveToolTracker(),
      sessionKey: 'session-1',
      runId: 'run-1',
    })

    expect(synthetic.result).toBe(diagnostic)
    expect(
      publicTelegramToolEvent('agent:main:telegram:key', synthetic),
    ).toMatchObject({
      phase: 'error',
      result: 'Tool failed. Retry shortly.',
    })
  })
})
