import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { chatQueryKeys, fetchSessions } from '../chat-queries'
import { isRecentSession } from '../pending-send'
import { filterSessionsWithTombstones } from '../session-tombstones'
import {
  fetchTelegramWorkstreams,
  telegramWorkstreamQueryKey,
} from '../telegram-workstreams'
import { useSessionTitles } from '../session-title-store'
import type { TelegramWorkstream } from '../telegram-workstreams'
import type { SessionTitleInfo } from '../session-title-store'
import type { SessionMeta } from '../types'

export function mergeSessionTitle(
  session: SessionMeta,
  stored: SessionTitleInfo | undefined,
): SessionMeta {
  if (!stored) return session

  const storedTitle = stored.title?.trim()
  const hasStoredManualTitle = stored.source === 'manual' && Boolean(storedTitle)
  const hasManualTitle = Boolean(session.label || session.title)
  const derivedTitle = hasStoredManualTitle
    ? storedTitle
    : hasManualTitle
      ? session.derivedTitle
      : (stored.title ?? session.derivedTitle)
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
  const titleStatus = stored.status ?? session.titleStatus
  const titleSource = hasStoredManualTitle
    ? 'manual'
    : hasManualTitle
      ? 'manual'
      : (stored.source ?? session.titleSource)
  const titleError = stored.error ?? session.titleError

  return {
    ...session,
    ...(hasStoredManualTitle
      ? {
          label: storedTitle,
          title: storedTitle,
        }
      : {}),
    derivedTitle,
    titleStatus,
    titleSource,
    // Only a title stored with source 'manual' was actually typed by the
    // user. titleSource is additionally set to 'manual' for any gateway
    // title, so it cannot carry this meaning.
    ...(hasStoredManualTitle ? { userTitle: storedTitle } : {}),
    titleError,
  }
}

export function mergeTelegramMetadata(
  session: SessionMeta,
  workstream: TelegramWorkstream | undefined,
): SessionMeta {
  if (!workstream) return session
  // Only a name the user typed in MC outranks the real Telegram topic name.
  // This used to read titleSource === 'manual', which is also set for any
  // gateway-generated title — so the session's AI title always won and the
  // chat header kept showing it while the workstream list showed the topic.
  const manualTitle = session.userTitle?.trim() || undefined
  return {
    ...session,
    // A title explicitly saved in MC outranks transport-derived metadata.
    // Otherwise the workstream title carries topic-name precedence (user
    // override → Telegram chat_topic → session AI title).
    title: manualTitle || workstream.title || session.title,
    derivedTitle: manualTitle || workstream.title || session.derivedTitle,
    // `label` has to move too. activeTitle reads label before title, so
    // leaving it behind meant the chat header kept showing the Hermes
    // session's AI-generated label while the workstream list showed the real
    // Telegram topic name.
    label: manualTitle || workstream.title || session.label,
    source: 'telegram',
    sessionKey: workstream.sessionKey,
    threadId: workstream.topicId,
    displayName: workstream.groupName,
  }
}

export function buildSyntheticActiveSession(
  activeFriendlyId: string,
  forcedSessionKey: string | undefined,
  stored: SessionTitleInfo | undefined,
  telegramWorkstream?: TelegramWorkstream,
): SessionMeta | null {
  if (!activeFriendlyId || activeFriendlyId === 'new') return null

  const derivedTitle =
    telegramWorkstream?.title ??
    stored?.title ??
    (activeFriendlyId === 'main' ? 'Hermes' : 'New Session')

  return {
    key: forcedSessionKey || activeFriendlyId,
    friendlyId: activeFriendlyId,
    label: undefined,
    title: telegramWorkstream?.title,
    derivedTitle,
    updatedAt: telegramWorkstream?.updatedAt ?? Date.now(),
    titleStatus: stored?.status ?? 'idle',
    titleSource: stored?.source,
    titleError: stored?.error,
    source: telegramWorkstream ? 'telegram' : undefined,
    sessionKey: telegramWorkstream?.sessionKey,
    threadId: telegramWorkstream?.topicId,
    displayName: telegramWorkstream?.groupName,
  }
}

type UseChatSessionsInput = {
  activeFriendlyId: string
  isNewChat: boolean
  forcedSessionKey?: string
}

export function useChatSessions({
  activeFriendlyId,
  isNewChat,
  forcedSessionKey,
}: UseChatSessionsInput) {
  const sessionsQuery = useQuery({
    queryKey: chatQueryKeys.sessions,
    queryFn: fetchSessions,
    refetchInterval: 5000,
  })
  const telegramWorkstreamsQuery = useQuery({
    queryKey: telegramWorkstreamQueryKey,
    queryFn: fetchTelegramWorkstreams,
    refetchInterval: 10_000,
  })
  const storedTitles = useSessionTitles()

  const sessions = useMemo(() => {
    const rawSessions = sessionsQuery.data ?? []
    const workstreams = telegramWorkstreamsQuery.data ?? []
    const workstreamBySessionId = new Map(
      workstreams.map((workstream) => [workstream.sessionId, workstream]),
    )
    const filtered = filterSessionsWithTombstones(rawSessions)
    const merged = filtered.map((session) =>
      mergeTelegramMetadata(
        mergeSessionTitle(session, storedTitles[session.friendlyId]),
        workstreamBySessionId.get(session.friendlyId),
      ),
    )
    const activeWorkstream = workstreamBySessionId.get(activeFriendlyId)
    const activeAlreadyPresent = merged.some(
      (session) => session.friendlyId === activeFriendlyId,
    )

    if (
      !activeAlreadyPresent &&
      (forcedSessionKey ||
        isRecentSession(activeFriendlyId) ||
        activeWorkstream)
    ) {
      const synthetic = buildSyntheticActiveSession(
        activeFriendlyId,
        forcedSessionKey,
        storedTitles[activeFriendlyId],
        activeWorkstream,
      )
      if (synthetic) {
        merged.unshift(synthetic)
      }
    }

    return merged.sort((a, b) => {
      const aTs = a.updatedAt ?? 0
      const bTs = b.updatedAt ?? 0
      return bTs - aTs
    })
  }, [
    activeFriendlyId,
    forcedSessionKey,
    sessionsQuery.data,
    storedTitles,
    telegramWorkstreamsQuery.data,
  ])

  const activeSession = useMemo(() => {
    return sessions.find((session) => session.friendlyId === activeFriendlyId)
  }, [sessions, activeFriendlyId])
  const activeExists = useMemo(() => {
    if (isNewChat) return true
    if (forcedSessionKey) return true
    if (isRecentSession(activeFriendlyId)) return true
    return sessions.some((session) => session.friendlyId === activeFriendlyId)
  }, [activeFriendlyId, forcedSessionKey, isNewChat, sessions])
  const activeSessionKey = activeSession?.key ?? ''
  const activeTitle = useMemo(() => {
    if (activeSession) {
      if (activeSession.label) return activeSession.label
      if (activeSession.title) return activeSession.title
      if (activeSession.derivedTitle) return activeSession.derivedTitle
      if (activeSession.titleStatus === 'generating') return 'Naming…'
      if (activeSession.titleStatus === 'error') return 'New Session'
      return 'New Session'
    }
    return activeFriendlyId === 'main' ? 'Hermes' : activeFriendlyId
  }, [activeFriendlyId, activeSession])

  const sessionsError =
    sessionsQuery.error instanceof Error ? sessionsQuery.error.message : null
  const sessionsLoading = sessionsQuery.isLoading && !sessionsQuery.data
  const sessionsFetching = sessionsQuery.isFetching

  return {
    sessionsQuery,
    sessions,
    activeSession,
    activeExists,
    activeSessionKey,
    activeTitle,
    sessionsError,
    sessionsLoading,
    sessionsFetching,
    refetchSessions: sessionsQuery.refetch,
  }
}
