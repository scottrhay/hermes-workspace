export const telegramWorkstreamQueryKey = [
  'chat',
  'telegram-workstreams',
] as const

export type TelegramWorkstream = {
  sessionId: string
  sessionKey: string
  groupName: string
  topicId: string
  title: string
  updatedAt: number
  messageCount: number
  isActive?: boolean
  preview?: string
}

export type TelegramWorkstreamGroup = {
  name: string
  workstreams: Array<TelegramWorkstream>
}

type TelegramWorkstreamsResponse = {
  workstreams?: Array<TelegramWorkstream>
  error?: string
}

export async function fetchTelegramWorkstreams(): Promise<
  Array<TelegramWorkstream>
> {
  const response = await fetch('/api/telegram-workstreams')
  const payload = (await response
    .json()
    .catch(() => ({}))) as TelegramWorkstreamsResponse
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to load Telegram workstreams')
  }
  return Array.isArray(payload.workstreams) ? payload.workstreams : []
}

export function filterTelegramWorkstreams(
  workstreams: Array<TelegramWorkstream>,
  query: string,
): Array<TelegramWorkstream> {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return workstreams
  return workstreams.filter((workstream) =>
    [workstream.groupName, workstream.title, workstream.topicId].some((value) =>
      value.toLowerCase().includes(normalized),
    ),
  )
}

export function groupTelegramWorkstreams(
  workstreams: Array<TelegramWorkstream>,
): Array<TelegramWorkstreamGroup> {
  const groups = new Map<string, Array<TelegramWorkstream>>()
  for (const workstream of workstreams) {
    const existing = groups.get(workstream.groupName)
    if (existing) existing.push(workstream)
    else groups.set(workstream.groupName, [workstream])
  }
  return Array.from(groups, ([name, groupedWorkstreams]) => ({
    name,
    workstreams: groupedWorkstreams,
  }))
}
