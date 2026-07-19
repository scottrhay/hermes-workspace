'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Moon02Icon,
  RefreshIcon,
  Search01Icon,
  Sun02Icon,
} from '@hugeicons/core-free-icons'
import {
  fetchTelegramWorkstreams,
  filterTelegramWorkstreams,
  groupTelegramWorkstreams,
  telegramWorkstreamQueryKey,
} from './telegram-workstreams'
import {
  formatWorkstreamTime,
  getAttentionWorkstreams,
  getGroupIcon,
  getWorkstreamState,
  sortWorkstreamGroups,
} from './chat-workstreams-view'
import type { TelegramWorkstream } from './telegram-workstreams'
import { usePageTitle } from '@/hooks/use-page-title'
import {
  getTheme,
  getThemeVariant,
  isDarkTheme,
  setTheme,
} from '@/lib/theme'
import { cn } from '@/lib/utils'

function TopicStatus({ workstream }: { workstream: TelegramWorkstream }) {
  const state = getWorkstreamState(workstream)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
        state === 'working'
          ? 'bg-sky-500/10 text-sky-600 dark:text-sky-300'
          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          state === 'working' ? 'animate-pulse bg-sky-500' : 'bg-amber-500',
        )}
      />
      <span className="sm:hidden">
        {state === 'working' ? 'Working' : 'Recent'}
      </span>
      <span className="hidden sm:inline">
        {state === 'working' ? 'Agent working' : 'Recent activity'}
      </span>
    </span>
  )
}

function AttentionCard({ workstream }: { workstream: TelegramWorkstream }) {
  const state = getWorkstreamState(workstream)
  return (
    <Link
      to="/chat/$sessionKey"
      params={{ sessionKey: workstream.sessionId }}
      className={cn(
        'group flex min-h-32 min-w-0 flex-col rounded-xl border border-primary-200 bg-primary-50 p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent-500/50 hover:shadow-md',
        state === 'working'
          ? 'border-t-[3px] border-t-sky-500'
          : 'border-t-[3px] border-t-amber-500',
      )}
      title={`Open ${workstream.groupName} · ${workstream.title}`}
    >
      <div className="flex items-start gap-2 text-[10px] font-semibold uppercase tracking-wide text-primary-400">
        <span aria-hidden="true">{getGroupIcon(workstream.groupName)}</span>
        <span className="min-w-0 flex-1 truncate">{workstream.groupName}</span>
        <span className="shrink-0 normal-case font-normal tracking-normal">
          {formatWorkstreamTime(workstream.updatedAt)}
        </span>
      </div>
      <div className="mt-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-primary-950">
          # {workstream.title}
        </span>
        <TopicStatus workstream={workstream} />
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-primary-500">
        {workstream.preview ||
          `${workstream.messageCount.toLocaleString()} messages in this topic.`}
      </p>
      <div className="mt-auto pt-2 text-[10px] text-primary-400">
        Topic #{workstream.topicId} · {workstream.messageCount.toLocaleString()}{' '}
        messages
      </div>
    </Link>
  )
}

function TopicChip({ workstream }: { workstream: TelegramWorkstream }) {
  return (
    <Link
      to="/chat/$sessionKey"
      params={{ sessionKey: workstream.sessionId }}
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-100/60 px-2.5 py-1.5 text-xs font-medium text-primary-800 transition hover:border-accent-500/50 hover:bg-accent-500/10 hover:text-accent-500"
      title={`${workstream.title} · Topic #${workstream.topicId} · ${workstream.messageCount} total messages`}
    >
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full',
          workstream.isActive ? 'animate-pulse bg-sky-500' : 'bg-primary-300',
        )}
      />
      <span className="truncate">{workstream.title}</span>
      {workstream.messageCount > 0 ? (
        <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-sky-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
          {workstream.messageCount.toLocaleString()}
        </span>
      ) : null}
    </Link>
  )
}

export function ChatWorkstreamsScreen() {
  usePageTitle('Chat')
  const [query, setQuery] = useState('')
  const [theme, setCurrentTheme] = useState(() => getTheme())
  const workstreamsQuery = useQuery({
    queryKey: telegramWorkstreamQueryKey,
    queryFn: fetchTelegramWorkstreams,
    refetchInterval: 10_000,
  })

  const filteredWorkstreams = useMemo(
    () => filterTelegramWorkstreams(workstreamsQuery.data ?? [], query),
    [query, workstreamsQuery.data],
  )
  const attentionWorkstreams = useMemo(
    () => getAttentionWorkstreams(filteredWorkstreams),
    [filteredWorkstreams],
  )
  const groups = useMemo(
    () => sortWorkstreamGroups(groupTelegramWorkstreams(filteredWorkstreams)),
    [filteredWorkstreams],
  )
  const dark = isDarkTheme(theme)
  const error =
    workstreamsQuery.error instanceof Error
      ? workstreamsQuery.error.message
      : null

  const toggleTheme = () => {
    const nextTheme = getThemeVariant(theme, dark ? 'light' : 'dark')
    setTheme(nextTheme)
    setCurrentTheme(nextTheme)
  }

  return (
    <div className="h-full min-w-0 overflow-x-hidden overflow-y-auto bg-primary-100/30">
      <header className="sticky top-0 z-20 border-b border-primary-200 bg-primary-50/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex min-w-0 max-w-[1500px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-bold text-primary-950">
              AIA Copilot Mission Control
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-primary-500">
              <span className="size-2 rounded-full bg-emerald-500" />
              Ariel · online
            </p>
          </div>
          <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-2 sm:w-auto sm:grid-cols-[18rem_auto]">
            <label className="relative min-w-0">
              <span className="sr-only">Search topics</span>
              <HugeiconsIcon
                icon={Search01Icon}
                size={15}
                strokeWidth={1.7}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary-400"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search topics…"
                className="h-10 w-full rounded-lg border border-primary-200 bg-primary-100/60 pl-9 pr-3 text-sm text-primary-900 outline-none transition placeholder:text-primary-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/15"
              />
            </label>
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <HugeiconsIcon
                icon={dark ? Sun02Icon : Moon02Icon}
                size={15}
                strokeWidth={1.7}
              />
              <span className="hidden sm:inline">
                {dark ? 'Light mode' : 'Dark mode'}
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto min-w-0 max-w-[1500px] space-y-7 p-4 md:p-6">
        {workstreamsQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div
                key={index}
                className="h-32 animate-pulse rounded-xl border border-primary-200 bg-primary-100"
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-primary-700">
            <div className="font-semibold text-primary-900">
              Telegram topics are unavailable.
            </div>
            <div className="mt-1 text-xs text-primary-500">{error}</div>
            <button
              type="button"
              onClick={() => void workstreamsQuery.refetch()}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-primary-200 px-3 py-2 text-xs font-semibold hover:bg-primary-100"
            >
              <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.7} />
              Retry
            </button>
          </div>
        ) : filteredWorkstreams.length === 0 ? (
          <div className="rounded-xl border border-primary-200 bg-primary-50 p-8 text-center">
            <div className="text-sm font-semibold text-primary-900">
              {query ? 'No matching topics' : 'No Telegram topics found'}
            </div>
            <p className="mt-1 text-xs text-primary-500">
              {query
                ? 'Try a group name, topic name, or topic number.'
                : 'Telegram workstreams will appear here when sessions are available.'}
            </p>
          </div>
        ) : (
          <>
            <section className="min-w-0" aria-labelledby="attention-heading">
              <div className="mb-3 flex min-w-0 items-center gap-3">
                <span className="h-6 w-1 rounded-full bg-sky-600" />
                <h2
                  id="attention-heading"
                  className="text-sm font-bold uppercase tracking-wide text-primary-900"
                >
                  Needs your attention
                </h2>
                <span className="hidden truncate text-xs text-primary-400 md:inline">
                  Active and recently updated topics
                </span>
              </div>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {attentionWorkstreams.map((workstream) => (
                  <AttentionCard
                    key={workstream.sessionKey}
                    workstream={workstream}
                  />
                ))}
              </div>
            </section>

            <section
              aria-label="Telegram groups and topics"
              className="grid min-w-0 gap-4 lg:grid-cols-2"
            >
              {groups.map((group) => {
                const activeCount = group.workstreams.filter(
                  (workstream) => workstream.isActive,
                ).length
                return (
                  <article
                    key={group.name}
                    className="min-w-0 rounded-xl border border-primary-200 bg-primary-50 p-3.5 shadow-sm"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-lg border border-primary-200 bg-primary-100 text-base">
                        {getGroupIcon(group.name)}
                      </span>
                      <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-primary-950">
                        {group.name}
                      </h2>
                      <span className="text-[10px] font-medium text-primary-400">
                        {activeCount > 0
                          ? `${activeCount} working`
                          : `${group.workstreams.length} topics`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.workstreams.map((workstream) => (
                        <TopicChip
                          key={workstream.sessionKey}
                          workstream={workstream}
                        />
                      ))}
                    </div>
                  </article>
                )
              })}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
