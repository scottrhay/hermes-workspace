/**
 * Focused regressions for Workstream A send-lifecycle requirements:
 *   AC1  – one submission lifecycle + one optimistic message
 *   AC3  – streaming chunks ordered; exactly one final message; no indicator after done
 *   AC4  – retry surfaces without duplicating
 *   AC5  – refresh/reconnect identity via session-storage persistence
 *   AC6  – duplicate submission, interruption/reconnect, optimistic reconciliation
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearRecoveryMessage,
  persistRecoveryMessage,
  readRecoveryMessage,
  restoreStreamingState,
  useChatStore,
} from './chat-store'
import type { ChatMessage } from '../screens/chat/types'

// ---------------------------------------------------------------------------
// Session-storage stub (jsdom does not provide one in node vitest env)
// ---------------------------------------------------------------------------
function makeSessionStorageStub() {
  const store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    clear: () => {
      for (const k of Object.keys(store)) delete store[k]
    },
  }
}

function makeTextMessage(
  id: string,
  role: string,
  text: string,
  extra: Record<string, unknown> = {},
): ChatMessage {
  return {
    id,
    role,
    timestamp: Date.now(),
    content: [{ type: 'text', text }],
    ...extra,
  } as ChatMessage
}

// ---------------------------------------------------------------------------
// Helpers to access the live store state cleanly
// ---------------------------------------------------------------------------
function getMessages(sessionKey: string): Array<ChatMessage> {
  return useChatStore.getState().getRealtimeMessages(sessionKey)
}

function getStreaming(sessionKey: string) {
  return useChatStore.getState().getStreamingState(sessionKey)
}

function dispatch(event: Parameters<typeof useChatStore.getState.prototype.processEvent>[0]) {
  useChatStore.getState().processEvent(event as any)
}

// ---------------------------------------------------------------------------
// 1. Streaming state is cleared after the done event (AC3 terminal cleanup)
// ---------------------------------------------------------------------------
describe('streaming terminal cleanup', () => {
  const SESSION = 'cleanup-session'

  beforeEach(() => {
    useChatStore.getState().clearSession(SESSION)
  })

  it('removes streaming state when done event arrives (AC3)', () => {
    dispatch({ type: 'chunk', sessionKey: SESSION, text: 'Hello', runId: 'r1', transport: 'send-stream' })
    expect(getStreaming(SESSION)).not.toBeNull()
    expect(getStreaming(SESSION)?.text).toBe('Hello')

    dispatch({
      type: 'done',
      sessionKey: SESSION,
      state: 'complete',
      runId: 'r1',
      transport: 'send-stream',
      message: makeTextMessage('msg-1', 'assistant', 'Hello'),
    })

    expect(getStreaming(SESSION)).toBeNull()
  })

  it('does not leave a streaming placeholder after done (AC3)', () => {
    dispatch({ type: 'chunk', sessionKey: SESSION, text: 'Streaming…', runId: 'r2', transport: 'send-stream' })
    dispatch({ type: 'chunk', sessionKey: SESSION, text: 'Streaming… done', runId: 'r2', transport: 'send-stream' })
    dispatch({
      type: 'done',
      sessionKey: SESSION,
      state: 'complete',
      runId: 'r2',
      transport: 'send-stream',
      message: makeTextMessage('msg-2', 'assistant', 'Streaming… done'),
    })

    // No streaming state left
    expect(getStreaming(SESSION)).toBeNull()
    // The final message IS in realtimeMessages
    const msgs = getMessages(SESSION)
    const assistantMsgs = msgs.filter((m) => m.role === 'assistant')
    expect(assistantMsgs).toHaveLength(1)
    expect((assistantMsgs[0] as any).__streamingStatus).toBe('complete')
  })
})

// ---------------------------------------------------------------------------
// 2. Exactly one final assistant message after duplicate done events (AC3 + AC1)
// ---------------------------------------------------------------------------
describe('duplicate done event deduplication', () => {
  const SESSION = 'dedup-done-session'

  beforeEach(() => {
    useChatStore.getState().clearSession(SESSION)
  })

  it('stores exactly one final assistant message when done fires twice with same content (AC3)', () => {
    const finalMsg = makeTextMessage('fin-1', 'assistant', 'The answer is 42')

    dispatch({ type: 'done', sessionKey: SESSION, state: 'complete', runId: 'r3', transport: 'send-stream', message: finalMsg })
    // Simulate chat-events firing the same done (would be skipped by runId guard,
    // but test the content-level dedup too by omitting transport/runId)
    dispatch({ type: 'done', sessionKey: SESSION, state: 'complete', message: { ...finalMsg } as any })

    const assistantMsgs = getMessages(SESSION).filter((m) => m.role === 'assistant')
    expect(assistantMsgs).toHaveLength(1)
  })

  it('replaces a pre-final tagged message with the clean done payload (AC3)', () => {
    // Server sometimes emits a <final>-wrapped chunk then a clean done message
    const taggedMsg = makeTextMessage('pre-1', 'assistant', '<final>The answer is 42</final>')
    dispatch({ type: 'message', sessionKey: SESSION, message: taggedMsg, runId: 'r4', transport: 'send-stream' })

    const cleanMsg = makeTextMessage('pre-1', 'assistant', 'The answer is 42')
    dispatch({ type: 'done', sessionKey: SESSION, state: 'complete', runId: 'r4', transport: 'send-stream', message: cleanMsg })

    const assistantMsgs = getMessages(SESSION).filter((m) => m.role === 'assistant')
    expect(assistantMsgs).toHaveLength(1)
    // Must contain clean text (tags stripped)
    const text = (assistantMsgs[0].content as any[])[0]?.text ?? ''
    expect(text).not.toContain('<final>')
  })
})

// ---------------------------------------------------------------------------
// 3. Optimistic user message survives while waiting for response (AC1 + AC3)
// ---------------------------------------------------------------------------
describe('optimistic message survival', () => {
  const SESSION = 'optimistic-session'

  beforeEach(() => {
    useChatStore.getState().clearSession(SESSION)
  })

  it('keeps optimistic user message in realtimeMessages while streaming (AC1)', () => {
    const optimistic = makeTextMessage('opt-1', 'user', 'Hello world', {
      clientId: 'cid-abc',
      __optimisticId: 'cid-abc',
      status: 'sending',
    })
    dispatch({ type: 'user_message', sessionKey: SESSION, message: optimistic, transport: 'send-stream' })

    expect(getMessages(SESSION).some((m) => (m as any).clientId === 'cid-abc')).toBe(true)

    // Streaming starts — optimistic message must still be present
    dispatch({ type: 'chunk', sessionKey: SESSION, text: 'Hi there', runId: 'r5', transport: 'send-stream' })

    const userMsgs = getMessages(SESSION).filter((m) => m.role === 'user')
    expect(userMsgs.length).toBeGreaterThanOrEqual(1)
    expect(userMsgs.some((m) => (m as any).clientId === 'cid-abc')).toBe(true)
  })

  it('reconciles optimistic user message with server-echoed message by clientId (AC1)', () => {
    const optimistic = makeTextMessage('opt-2', 'user', 'Test message', {
      clientId: 'cid-xyz',
      status: 'sending',
    })
    dispatch({ type: 'user_message', sessionKey: SESSION, message: optimistic, transport: 'send-stream' })

    // Server echoes back the canonical message carrying the same clientId/nonce
    const serverEcho = makeTextMessage('server-2', 'user', 'Test message', {
      clientId: 'cid-xyz',
    })
    dispatch({ type: 'message', sessionKey: SESSION, message: serverEcho, transport: 'send-stream' })

    const userMsgs = getMessages(SESSION).filter((m) => m.role === 'user')
    // Should be merged/reconciled — not duplicated
    expect(userMsgs).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 4. Chat-events events are skipped for active send-stream runs (AC1)
// ---------------------------------------------------------------------------
describe('send-stream run isolation', () => {
  const SESSION = 'isolation-session'

  beforeEach(() => {
    useChatStore.getState().clearSession(SESSION)
    // Reset sendStreamRunIds
    useChatStore.setState({ sendStreamRunIds: new Set() })
  })

  it('ignores chat-events done for a run already handled by send-stream (AC1)', () => {
    useChatStore.getState().registerSendStreamRun('run-iso-1')

    // send-stream done arrives first — this is the authoritative event
    dispatch({
      type: 'done',
      sessionKey: SESSION,
      state: 'complete',
      runId: 'run-iso-1',
      transport: 'send-stream',
      message: makeTextMessage('iso-msg-1', 'assistant', 'Isolated answer'),
    })

    // chat-events fires the same done (transport NOT send-stream)
    dispatch({
      type: 'done',
      sessionKey: SESSION,
      state: 'complete',
      runId: 'run-iso-1',
      // no transport field → treated as chat-events
      message: makeTextMessage('iso-msg-2', 'assistant', 'Isolated answer'),
    })

    const assistantMsgs = getMessages(SESSION).filter((m) => m.role === 'assistant')
    expect(assistantMsgs).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 5. Recovery message persist/restore survives sessionStorage round-trip (AC5)
// ---------------------------------------------------------------------------
describe('recovery message persistence (AC5 refresh/reconnect)', () => {
  let stubStorage: ReturnType<typeof makeSessionStorageStub>

  beforeEach(() => {
    stubStorage = makeSessionStorageStub()
    vi.stubGlobal('sessionStorage', stubStorage)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persists and retrieves a recovery message within TTL', () => {
    const SESSION = 'recovery-session'
    const msg = makeTextMessage('rec-1', 'assistant', 'Recovery response')

    persistRecoveryMessage(SESSION, msg)
    const retrieved = readRecoveryMessage(SESSION)

    expect(retrieved).not.toBeNull()
    expect((retrieved!.content as any[])[0]?.text).toBe('Recovery response')
  })

  it('returns null and removes stale recovery messages past TTL', () => {
    const SESSION = 'stale-recovery-session'
    const msg = makeTextMessage('stale-1', 'assistant', 'Old response')

    // Write a message with a timestamp that is 6 minutes old (past 5-min TTL)
    const key = `claude_recovery_msg_${SESSION}`
    stubStorage.setItem(
      key,
      JSON.stringify({ message: msg, storedAt: Date.now() - 6 * 60 * 1000 }),
    )

    const retrieved = readRecoveryMessage(SESSION)
    expect(retrieved).toBeNull()
    expect(stubStorage.getItem(key)).toBeNull()
  })

  it('clearRecoveryMessage removes the entry', () => {
    const SESSION = 'clear-recovery-session'
    const msg = makeTextMessage('clr-1', 'assistant', 'Clear me')

    persistRecoveryMessage(SESSION, msg)
    expect(readRecoveryMessage(SESSION)).not.toBeNull()

    clearRecoveryMessage(SESSION)
    expect(readRecoveryMessage(SESSION)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 6. Streaming state restore from sessionStorage (AC5 interruption/reconnect)
// ---------------------------------------------------------------------------
describe('streaming state restore (AC5 interruption/reconnect)', () => {
  let stubStorage: ReturnType<typeof makeSessionStorageStub>

  beforeEach(() => {
    stubStorage = makeSessionStorageStub()
    vi.stubGlobal('sessionStorage', stubStorage)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when no stored state exists', () => {
    expect(restoreStreamingState('no-such-session')).toBeNull()
  })

  it('restores streaming state from sessionStorage within 60-second window', () => {
    const SESSION = 'restore-streaming-session'
    const key = `claude_streaming_${SESSION}`
    const state = {
      runId: 'r-restore',
      text: 'In-progress text',
      thinking: '',
      lifecycleEvents: [],
      toolCalls: [],
      _savedAt: Date.now() - 10_000, // 10 seconds ago — within 60s window
    }
    stubStorage.setItem(key, JSON.stringify(state))

    const restored = restoreStreamingState(SESSION)
    expect(restored).not.toBeNull()
    expect(restored!.text).toBe('In-progress text')
    expect(restored!.runId).toBe('r-restore')
    // _savedAt must be stripped from the returned object
    expect((restored as any)._savedAt).toBeUndefined()
  })

  it('discards streaming state older than 60 seconds (stale reconnect guard)', () => {
    const SESSION = 'stale-streaming-session'
    const key = `claude_streaming_${SESSION}`
    const state = {
      runId: 'r-stale',
      text: 'Old text',
      thinking: '',
      lifecycleEvents: [],
      toolCalls: [],
      _savedAt: Date.now() - 90_000, // 90 seconds ago — past 60s window
    }
    stubStorage.setItem(key, JSON.stringify(state))

    const restored = restoreStreamingState(SESSION)
    expect(restored).toBeNull()
    expect(stubStorage.getItem(key)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 7. Session waiting state management (AC5 refresh identity)
// ---------------------------------------------------------------------------
describe('session waiting state (AC5)', () => {
  const SESSION = 'waiting-session'

  beforeEach(() => {
    useChatStore.getState().clearSessionWaiting(SESSION)
  })

  it('marks a session as waiting and clears it', () => {
    useChatStore.getState().setSessionWaiting(SESSION, 'run-w1')
    expect(useChatStore.getState().isSessionWaiting(SESSION)).toBe(true)

    useChatStore.getState().clearSessionWaiting(SESSION)
    expect(useChatStore.getState().isSessionWaiting(SESSION)).toBe(false)
  })

  it('waiting meta stores the runId for active-run reconciliation', () => {
    useChatStore.getState().setSessionWaiting(SESSION, 'run-meta-1')
    const meta = useChatStore.getState().waitingSessionMeta[SESSION]
    expect(meta?.runId).toBe('run-meta-1')
  })
})
