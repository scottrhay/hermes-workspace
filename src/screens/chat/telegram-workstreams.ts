export const telegramWorkstreamQueryKey = [
  'chat',
  'telegram-workstreams',
] as const

export type TelegramWorkstream = {
  sessionId: string
  sessionKey: string
  groupName: string
  chatId: string
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

export type RenameTelegramTopicResult = {
  ok: boolean
  telegram?: string
  telegramError?: string
  error?: string
}

export type CreatedTelegramTopic = {
  sessionId: string
  sessionKey: string
  groupName: string
  chatId: string
  topicId: string
  title: string
}

export async function createTelegramTopic(input: {
  chatId: string
  groupName: string
  name: string
}): Promise<CreatedTelegramTopic> {
  const response = await fetch('/api/telegram-topic-create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    topic?: CreatedTelegramTopic
    error?: string
  }
  if (!response.ok || !payload.topic) {
    throw new Error(payload.error || 'Failed to create Telegram topic')
  }
  return payload.topic
}

export async function renameTelegramTopic(input: {
  chatId: string
  topicId: string
  name: string
}): Promise<RenameTelegramTopicResult> {
  const response = await fetch('/api/telegram-topic-name', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = (await response
    .json()
    .catch(() => ({}))) as RenameTelegramTopicResult
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to rename Telegram topic')
  }
  return payload
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
