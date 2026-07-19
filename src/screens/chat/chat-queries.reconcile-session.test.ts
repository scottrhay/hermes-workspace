import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  appendHistoryMessage,
  chatQueryKeys,
  reconcileSessionDraft,
} from './chat-queries'
import type { HistoryResponse, SessionMeta } from './types'

function makeSession(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    key: 'draft-key',
    friendlyId: 'draft-friendly',
    updatedAt: 100,
    titleStatus: 'idle',
    lastMessage: {
      role: 'user',
      timestamp: 100,
      content: [{ type: 'text', text: 'draft message' }],
    },
    ...overrides,
  }
}

describe('reconcileSessionDraft', () => {
  it('promotes an optimistic draft session to the resolved ids', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['chat', 'sessions'], [makeSession()])

    reconcileSessionDraft(
      queryClient,
      'draft-friendly',
      'draft-key',
      'real-friendly',
      'real-key',
    )

    const sessions = queryClient.getQueryData(['chat', 'sessions']) as Array<SessionMeta>
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      key: 'real-key',
      friendlyId: 'real-friendly',
      updatedAt: 100,
    })
  })

  it('merges the optimistic draft into an existing resolved session entry', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['chat', 'sessions'], [
      makeSession({
        key: 'draft-key',
        friendlyId: 'draft-friendly',
        updatedAt: 500,
        lastMessage: {
          role: 'user',
          timestamp: 500,
          content: [{ type: 'text', text: 'fresh draft message' }],
        },
        titleStatus: 'generating',
      }),
      makeSession({
        key: 'real-key',
        friendlyId: 'real-friendly',
        updatedAt: 100,
        label: 'Existing Session',
        titleStatus: 'idle',
        lastMessage: {
          role: 'assistant',
          timestamp: 100,
          content: [{ type: 'text', text: 'older real message' }],
        },
      }),
    ])

    reconcileSessionDraft(
      queryClient,
      'draft-friendly',
      'draft-key',
      'real-friendly',
      'real-key',
    )

    const sessions = queryClient.getQueryData(['chat', 'sessions']) as Array<SessionMeta>
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      key: 'real-key',
      friendlyId: 'real-friendly',
      label: 'Existing Session',
      titleStatus: 'generating',
      updatedAt: 500,
    })
    expect(sessions[0].lastMessage).toMatchObject({
      timestamp: 500,
    })
  })
})

describe('appendHistoryMessage', () => {
  it('reconciles a Telegram-framed canonical echo with the clean optimistic WebUI message', () => {
    const queryClient = new QueryClient()
    const key = chatQueryKeys.history('session-1', 'telegram:topic:2246')
    queryClient.setQueryData(key, {
      sessionKey: 'telegram:topic:2246',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Run the tests' }],
          __optimisticId: 'opt-webui-1',
          status: 'sending',
          timestamp: Date.now() - 60_000,
        },
      ],
    } satisfies HistoryResponse)

    appendHistoryMessage(queryClient, 'session-1', 'telegram:topic:2246', {
      role: 'user',
      content: [
        {
          type: 'text',
          text: '[Scott Hay] <workspace_context active="true" name="Home" path="/home/scott/workspace" />\n\nRun the tests',
        },
      ],
      timestamp: Date.now(),
    })

    const history = queryClient.getQueryData(key) as HistoryResponse
    expect(history.messages).toHaveLength(1)
    expect(history.messages[0]?.__optimisticId).toBeUndefined()
  })
})
