type TelegramApiResponse<T> = {
  ok?: boolean
  result?: T
  description?: string
}

export async function telegramApi<T>(
  method: string,
  token: string,
  body: Record<string, unknown>,
): Promise<T> {
  const cleanToken = token.trim()
  if (!cleanToken) throw new Error('Telegram credentials are unavailable')
  const response = await fetch(
    `https://api.telegram.org/bot${cleanToken}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    },
  )
  const payload = (await response.json().catch(() => ({}))) as TelegramApiResponse<T>
  if (!response.ok || payload.ok !== true || payload.result === undefined) {
    throw new Error(
      payload.description || `Telegram API request failed (${response.status})`,
    )
  }
  return payload.result
}

export async function createTelegramForumTopic(
  chatId: string,
  title: string,
  token: string,
): Promise<{ topicId: string; title: string }> {
  const cleanChatId = chatId.trim()
  const cleanTitle = title.trim()
  if (!cleanChatId) throw new Error('chatId is required')
  if (!cleanTitle) throw new Error('Topic name is required')
  if (cleanTitle.length > 128) {
    throw new Error('Topic name must be 128 characters or fewer')
  }
  const result = await telegramApi<{ message_thread_id?: number; name?: string }>(
    'createForumTopic',
    token,
    { chat_id: cleanChatId, name: cleanTitle },
  )
  if (!Number.isInteger(result.message_thread_id)) {
    throw new Error('Telegram did not return a topic ID')
  }
  return {
    topicId: String(result.message_thread_id),
    title: typeof result.name === 'string' && result.name.trim()
      ? result.name.trim()
      : cleanTitle,
  }
}

export async function deleteTelegramForumTopic(
  chatId: string,
  topicId: string,
  token: string,
): Promise<boolean> {
  return telegramApi<boolean>('deleteForumTopic', token, {
    chat_id: chatId.trim(),
    message_thread_id: Number(topicId),
  })
}
