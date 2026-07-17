'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  MessageMultiple01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { memo, useMemo, useState } from 'react'
import {
  fetchTelegramWorkstreams,
  filterTelegramWorkstreams,
  groupTelegramWorkstreams,
  telegramWorkstreamQueryKey,
} from '../../telegram-workstreams'
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type TelegramWorkstreamsProps = {
  activeFriendlyId: string
  onSelect?: () => void
}

export const TelegramWorkstreams = memo(function TelegramWorkstreamsComponent({
  activeFriendlyId,
  onSelect,
}: TelegramWorkstreamsProps) {
  const [query, setQuery] = useState('')
  const workstreamsQuery = useQuery({
    queryKey: telegramWorkstreamQueryKey,
    queryFn: fetchTelegramWorkstreams,
    refetchInterval: 10_000,
  })
  const groups = useMemo(
    () =>
      groupTelegramWorkstreams(
        filterTelegramWorkstreams(workstreamsQuery.data ?? [], query),
      ),
    [query, workstreamsQuery.data],
  )
  const error =
    workstreamsQuery.error instanceof Error
      ? workstreamsQuery.error.message
      : null

  return (
    <Collapsible className="w-full" defaultOpen>
      <CollapsibleTrigger className="group flex w-full items-center gap-1.5 px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-primary-500 hover:bg-transparent">
        <HugeiconsIcon
          icon={MessageMultiple01Icon}
          size={13}
          strokeWidth={1.8}
        />
        <span className="select-none">Telegram Workstreams</span>
        <span className="ml-auto rounded p-0.5 transition-colors hover:bg-primary-200 dark:hover:bg-primary-800">
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={12}
            strokeWidth={2}
            className="-rotate-90 transition-transform duration-150 group-data-panel-open:rotate-0"
          />
        </span>
      </CollapsibleTrigger>

      <CollapsiblePanel contentClassName="px-3 pb-2">
        <label className="relative mt-1 block">
          <span className="sr-only">Search Telegram workstreams</span>
          <HugeiconsIcon
            icon={Search01Icon}
            size={14}
            strokeWidth={1.7}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--theme-muted)' }}
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Telegram workstreams"
            className="h-8 w-full rounded-lg border pl-8 pr-2 text-xs outline-none transition-colors placeholder:text-primary-500 focus:border-accent-500"
            style={{
              background: 'var(--theme-panel)',
              borderColor: 'var(--theme-border)',
              color: 'var(--theme-text)',
            }}
          />
        </label>

        <div className="mt-1.5 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
          {workstreamsQuery.isLoading ? (
            <div className="px-2 py-2 text-xs text-primary-500">
              Loading Telegram workstreams…
            </div>
          ) : error ? (
            <div className="px-2 py-2 text-xs text-primary-500">
              <div>Failed to load Telegram workstreams.</div>
              <div className="mt-1 text-[11px] opacity-80">{error}</div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-1.5"
                onClick={() => void workstreamsQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : groups.length === 0 ? (
            <div className="px-2 py-2 text-xs text-primary-500">
              {query.trim()
                ? 'No matching Telegram workstreams.'
                : 'No Telegram workstreams found.'}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.name} className="mb-2 last:mb-0">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary-400">
                  {group.name}
                </div>
                <div className="space-y-px">
                  {group.workstreams.map((workstream) => {
                    const active = workstream.sessionId === activeFriendlyId
                    return (
                      <Link
                        key={workstream.sessionKey}
                        to="/chat/$sessionKey"
                        params={{ sessionKey: workstream.sessionId }}
                        onClick={onSelect}
                        className={cn(
                          'block rounded-lg px-2 py-1.5 transition-colors',
                          active
                            ? 'bg-accent-500/10 text-accent-500'
                            : 'hover:bg-primary-200 dark:hover:bg-primary-800',
                        )}
                        style={
                          active ? undefined : { color: 'var(--theme-text)' }
                        }
                        title={`${group.name} · ${workstream.title} · Topic #${workstream.topicId}`}
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-primary-400">
                            Topic
                          </span>
                          <span className="truncate text-xs font-medium">
                            {workstream.title}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-primary-400">
                          <span>#{workstream.topicId}</span>
                          <span aria-hidden="true">·</span>
                          <span>{workstream.messageCount} messages</span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  )
})
