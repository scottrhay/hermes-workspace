export type TelegramSessionRow = {
  id?: string
  source?: string | null
  user_id?: string | null
  session_key?: string | null
  chat_id?: string | null
  chat_type?: string | null
  thread_id?: string | null
  display_name?: string | null
  origin_json?: string | null
  title?: string | null
  started_at?: number | null
  last_active?: number | null
  message_count?: number | null
  is_active?: boolean | null
}

export type TelegramWorkstream = {
  sessionId: string
  sessionKey: string
  groupName: string
  topicId: string
  title: string
  updatedAt: number
  messageCount: number
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function originGroupName(originJson: unknown): string {
  const raw = cleanString(originJson)
  if (!raw) return ''
  try {
    const origin = JSON.parse(raw) as Record<string, unknown>
    return cleanString(origin.chat_name)
  } catch {
    return ''
  }
}

function secondsToMilliseconds(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value * 1000)
    : 0
}

export function getTelegramOwnerUserId(
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    env.AIA_TELEGRAM_OWNER_USER_ID ||
    env.TELEGRAM_OWNER_USER_ID ||
    '8304360654'
  ).trim()
}

function isNewerSession(
  candidate: TelegramSessionRow,
  current: TelegramSessionRow,
): boolean {
  const candidateStarted = candidate.started_at ?? 0
  const currentStarted = current.started_at ?? 0
  if (candidateStarted !== currentStarted) {
    return candidateStarted > currentStarted
  }
  const candidateActive = candidate.last_active ?? 0
  const currentActive = current.last_active ?? 0
  if (candidateActive !== currentActive) return candidateActive > currentActive
  return cleanString(candidate.id).localeCompare(cleanString(current.id)) > 0
}

export function normalizeTelegramWorkstreams(
  rows: Array<TelegramSessionRow>,
  ownerUserId: string,
): Array<TelegramWorkstream> {
  const owner = cleanString(ownerUserId)
  const newestByKey = new Map<string, TelegramSessionRow>()
  const groupNameByKey = new Map<string, string>()
  const groupNameByChatId = new Map<string, string>()

  for (const row of rows) {
    const sessionId = cleanString(row.id)
    const sessionKey = cleanString(row.session_key)
    const topicId = cleanString(row.thread_id)
    if (
      cleanString(row.source).toLowerCase() !== 'telegram' ||
      cleanString(row.user_id) !== owner ||
      !sessionId ||
      !sessionKey ||
      !topicId ||
      topicId === '1'
    ) {
      continue
    }

    const groupName =
      cleanString(row.display_name) || originGroupName(row.origin_json)
    if (groupName && !groupNameByKey.has(sessionKey)) {
      groupNameByKey.set(sessionKey, groupName)
    }
    const chatId = cleanString(row.chat_id)
    if (groupName && chatId && !groupNameByChatId.has(chatId)) {
      groupNameByChatId.set(chatId, groupName)
    }

    const existing = newestByKey.get(sessionKey)
    if (!existing || isNewerSession(row, existing)) {
      newestByKey.set(sessionKey, row)
    }
  }

  return Array.from(newestByKey.entries())
    .map(([sessionKey, row]) => {
      const topicId = cleanString(row.thread_id)
      return {
        sessionId: cleanString(row.id),
        sessionKey,
        groupName:
          cleanString(row.display_name) ||
          originGroupName(row.origin_json) ||
          groupNameByKey.get(sessionKey) ||
          groupNameByChatId.get(cleanString(row.chat_id)) ||
          'Telegram Group',
        topicId,
        title: cleanString(row.title) || `Topic ${topicId}`,
        updatedAt: secondsToMilliseconds(row.last_active ?? row.started_at),
        messageCount:
          typeof row.message_count === 'number' &&
          Number.isFinite(row.message_count)
            ? row.message_count
            : 0,
      }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function resolveAuthorizedTelegramWorkstream(
  rows: Array<TelegramSessionRow>,
  sessionKey: string,
  ownerUserId: string,
): TelegramWorkstream | null {
  return (
    normalizeTelegramWorkstreams(rows, ownerUserId).find(
      (workstream) => workstream.sessionKey === cleanString(sessionKey),
    ) ?? null
  )
}

export function isAuthorizedTelegramSessionPair(
  rows: Array<TelegramSessionRow>,
  sessionKey: string,
  concreteSessionId: string,
  ownerUserId: string,
): boolean {
  const key = cleanString(sessionKey)
  const sessionId = cleanString(concreteSessionId)
  const owner = cleanString(ownerUserId)
  if (!key || !sessionId || !owner) return false

  return rows.some(
    (row) =>
      cleanString(row.source).toLowerCase() === 'telegram' &&
      cleanString(row.user_id) === owner &&
      cleanString(row.session_key) === key &&
      cleanString(row.id) === sessionId &&
      cleanString(row.thread_id) !== '1',
  )
}

export function isTelegramWorkstreamActive(
  rows: Array<TelegramSessionRow>,
  sessionKey: string,
  ownerUserId: string,
): boolean {
  const currentWorkstream = resolveAuthorizedTelegramWorkstream(
    rows,
    sessionKey,
    ownerUserId,
  )
  if (!currentWorkstream) return false
  return rows.some(
    (row) =>
      cleanString(row.id) === currentWorkstream.sessionId &&
      row.is_active === true,
  )
}
