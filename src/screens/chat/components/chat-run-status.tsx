import { useEffect, useMemo, useState } from 'react'

import { useChatStore } from '@/stores/chat-store'

type ToolCall = {
  id: string
  name: string
  phase: string
}

type LifecycleEvent = {
  text: string
  emoji: string
  timestamp: number
  isError: boolean
}

type ChatRunStatusProps = {
  active: boolean
  sending: boolean
  isStreaming: boolean
  streamingText?: string
  streamingThinking?: string
  activeToolCalls: Array<ToolCall>
  lifecycleEvents: Array<LifecycleEvent>
  isCompacting?: boolean
}

type ChatRunStatusInput = {
  sending?: boolean
  isStreaming?: boolean
  streamingText?: string
  streamingThinking?: string
  activeToolCalls?: Array<ToolCall>
  heartbeatActivity?: string | null
  isCompacting?: boolean
}

function isRunningTool(tool: ToolCall): boolean {
  return !['done', 'complete', 'completed', 'error', 'failed'].includes(
    tool.phase.toLowerCase(),
  )
}

function describeTool(name: string): string {
  const normalized = name.trim().toLowerCase()
  if (normalized === 'skill_view' || normalized.includes('skill')) {
    return 'reading a skill'
  }
  if (
    normalized === 'read_file' ||
    normalized.includes('document') ||
    normalized.includes('pdf')
  ) {
    return 'reading a file'
  }
  if (normalized === 'search_files' || normalized.includes('file_search')) {
    return 'searching files'
  }
  if (normalized === 'web_search' || normalized.includes('search_web')) {
    return 'searching the web'
  }
  if (
    normalized.startsWith('browser_') ||
    normalized === 'web_extract' ||
    normalized.includes('fetch_web')
  ) {
    return 'browsing the web'
  }
  if (
    normalized === 'terminal' ||
    normalized === 'execute_code' ||
    normalized.includes('shell')
  ) {
    return 'running a command'
  }
  if (normalized.includes('image') || normalized.includes('vision')) {
    return 'inspecting an image'
  }
  if (normalized.includes('delegate') || normalized.includes('subagent')) {
    return 'coordinating specialist work'
  }
  return `using ${name.replace(/_/g, ' ')}`
}

export function deriveChatRunStatus({
  sending = false,
  streamingText,
  streamingThinking,
  activeToolCalls = [],
  heartbeatActivity,
  isCompacting = false,
}: ChatRunStatusInput = {}): string {
  if (isCompacting) return 'Ariel is organizing context…'
  const runningTool = [...activeToolCalls].reverse().find(isRunningTool)
  if (runningTool) return `Ariel is ${describeTool(runningTool.name)}…`
  if (streamingText?.trim()) return 'Ariel is writing the response…'
  if (streamingThinking?.trim()) return 'Ariel is thinking through your request…'
  if (heartbeatActivity?.trim()) return heartbeatActivity.trim()
  if (sending) return 'Sending message to Ariel…'
  return 'Ariel is working…'
}

export function ChatRunStatus({
  active,
  sending,
  isStreaming,
  streamingText,
  streamingThinking,
  activeToolCalls,
  lifecycleEvents,
  isCompacting = false,
}: ChatRunStatusProps) {
  const heartbeatActivity = useChatStore((state) => state.heartbeatActivity)
  const [expanded, setExpanded] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!active) {
      setElapsed(0)
      setExpanded(false)
      return
    }
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [active])

  const status = deriveChatRunStatus({
    sending,
    isStreaming,
    streamingText,
    streamingThinking,
    activeToolCalls,
    heartbeatActivity,
    isCompacting,
  })
  const activityRows = useMemo(
    () => [
      ...lifecycleEvents.map((event) => ({
        key: `lifecycle-${event.timestamp}-${event.text}`,
        text: event.text,
        done: true,
      })),
      ...activeToolCalls.map((tool) => ({
        key: tool.id || `${tool.name}-${tool.phase}`,
        text: `Ariel is ${describeTool(tool.name)}`,
        done: ['done', 'complete', 'completed'].includes(tool.phase),
      })),
    ].slice(-5),
    [activeToolCalls, lifecycleEvents],
  )

  if (!active) return null

  const elapsedLabel =
    elapsed >= 60
      ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
      : `${elapsed}s`

  return (
    <div
      className="mx-3 mb-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[var(--theme-text)] shadow-sm backdrop-blur max-md:fixed max-md:bottom-[calc(var(--chat-composer-height,56px)+8px)] max-md:left-3 max-md:right-3 max-md:z-[75] max-md:mx-0 max-md:mb-0 md:mx-4"
      role="status"
      aria-live="polite"
      data-chat-run-status
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-500"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--theme-text)]">
          {status}
        </span>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--theme-muted)]">
          {elapsedLabel}
        </span>
        {activityRows.length > 0 || expanded ? (
          // Stays mounted while expanded even if the activity list empties out
          // — otherwise the toggle disappears mid-run and the panel can be
          // opened but never closed.
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="-my-1 shrink-0 rounded-md px-2 py-2 text-[11px] font-medium text-[var(--theme-accent)] hover:bg-[var(--theme-card2)]"
            aria-expanded={expanded}
          >
            {expanded ? 'Hide' : `Activity ${activityRows.length}`}
          </button>
        ) : null}
      </div>
      {expanded ? (
        <div className="mt-2 space-y-1 border-t border-[var(--theme-border)] pt-2">
          {activityRows.map((row) => (
            <div
              key={row.key}
              className="flex items-center gap-2 text-[11px] text-[var(--theme-muted)]"
            >
              <span aria-hidden="true">{row.done ? '✓' : '•'}</span>
              <span className="truncate">{row.text}</span>
            </div>
          ))}
        </div>
      ) : null}
      <span className="sr-only">
        {sending ? 'Sending. ' : ''}
        {isStreaming ? 'Streaming. ' : ''}
        {streamingThinking ? 'Thinking. ' : ''}
        {streamingText ? 'Writing response. ' : ''}
        {isCompacting ? 'Organizing context. ' : ''}
        {heartbeatActivity || ''}
      </span>
    </div>
  )
}
