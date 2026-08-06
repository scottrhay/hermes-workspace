import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  RefreshIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useDeferredValue, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { ResearchCard } from './research-card'
import { ResearchDetail } from './research-detail'
import {
  type ResearchDecision,
  type ResearchItem,
  type ResearchKind,
  type ResearchListResponse,
  type ResearchSearchResponse,
  type ResearchSourceType,
} from './research-types'

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Request failed (${response.status})`)
  }
  return (await response.json()) as T
}

const RANGE_OPTIONS = [
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: 'all', label: 'All time' },
] as const

type RangeId = (typeof RANGE_OPTIONS)[number]['id']

const CATEGORY_CHIP_LIMIT = 8

const SOURCE_LABELS: Record<ResearchSourceType, string> = {
  youtube: 'YouTube',
  x: 'X',
  linkedin: 'LinkedIn',
  medium: 'Medium',
  substack: 'Substack',
  web: 'Web',
  internal: 'Internal',
}

function isoDaysAgo(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs transition',
        active
          ? 'border-primary-500 bg-primary-200 text-primary-900'
          : 'border-primary-200 text-primary-600 hover:border-primary-400',
      )}
    >
      {children}
    </button>
  )
}

function CardGrid({
  items,
  selectedPath,
  onSelect,
}: {
  items: Array<ResearchItem>
  selectedPath: string | null
  onSelect: (item: ResearchItem) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <ResearchCard
          key={item.path}
          item={item}
          selected={item.path === selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function CollapsibleSection({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string
  count: number
  defaultOpen: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 text-left"
      >
        <HugeiconsIcon
          icon={open ? ArrowDown01Icon : ArrowRight01Icon}
          className="size-4 text-primary-500"
        />
        <h2 className="font-semibold text-primary-900 text-sm uppercase tracking-wide">
          {title}
        </h2>
        <span className="text-primary-500 text-xs tabular-nums">{count}</span>
      </button>
      {open ? children : null}
    </section>
  )
}

export function ResearchScreen() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<ResearchKind>('curated')
  const [searchInput, setSearchInput] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [sourceType, setSourceType] = useState<ResearchSourceType | null>(null)
  const [decision, setDecision] = useState<ResearchDecision | null>(null)
  const [range, setRange] = useState<RangeId>('all')
  const [selected, setSelected] = useState<ResearchItem | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const deferredSearch = useDeferredValue(searchInput)
  const searchTerm = deferredSearch.trim()

  const listQuery = useQuery({
    queryKey: ['research', 'list'],
    queryFn: () => readJson<ResearchListResponse>('/api/research/list'),
  })

  // The index only carries the first matching line per file, so body search
  // runs server-side and its hits are intersected with the filtered set.
  const searchQuery = useQuery({
    queryKey: ['research', 'search', searchTerm, tab],
    queryFn: () =>
      readJson<ResearchSearchResponse>(
        `/api/research/search?q=${encodeURIComponent(searchTerm)}&kind=${tab}`,
      ),
    enabled: searchTerm.length > 1,
  })

  const items = listQuery.data?.items ?? []
  const facets = listQuery.data?.facets
  const exists = listQuery.data?.exists ?? false
  const root = listQuery.data?.root ?? ''

  const bodyMatches = useMemo(() => {
    if (searchTerm.length <= 1) return null
    return new Set((searchQuery.data?.results ?? []).map((hit) => hit.path))
  }, [searchQuery.data, searchTerm])

  const tabItems = useMemo(
    () => items.filter((item) => item.kind === tab),
    [items, tab],
  )

  const filtered = useMemo(() => {
    const cutoff = range === 'all' ? null : isoDaysAgo(Number(range))
    const needle = searchTerm.toLowerCase()

    return tabItems.filter((item) => {
      if (category && item.category !== category) return false
      if (sourceType && item.sourceType !== sourceType) return false
      if (decision && item.decision !== decision) return false
      if (cutoff && item.date < cutoff) return false
      if (needle.length > 1) {
        const inTitle =
          item.title.toLowerCase().includes(needle) ||
          (item.summary?.toLowerCase().includes(needle) ?? false) ||
          item.tags.some((tag) => tag.toLowerCase().includes(needle))
        if (!inTitle && !bodyMatches?.has(item.path)) return false
      }
      return true
    })
  }, [
    tabItems,
    category,
    sourceType,
    decision,
    range,
    searchTerm,
    bodyMatches,
  ])

  const recentCutoff = useMemo(() => isoDaysAgo(7), [])
  const recent = useMemo(
    () => filtered.filter((item) => item.date >= recentCutoff),
    [filtered, recentCutoff],
  )

  const grouped = useMemo(() => {
    const groups = new Map<string, Array<ResearchItem>>()
    for (const item of filtered) {
      const bucket = groups.get(item.categoryLabel)
      if (bucket) bucket.push(item)
      else groups.set(item.categoryLabel, [item])
    }
    return Array.from(groups.entries()).sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
    )
  }, [filtered])

  const tabFacets = useMemo(
    () => (facets?.categories ?? []).filter((entry) => entry.kind === tab),
    [facets, tab],
  )

  // The library has a long tail of one-off folders; showing all ~20 at once
  // pushed the filter row five lines deep.
  const [showAllCategories, setShowAllCategories] = useState(false)
  const visibleFacets = showAllCategories
    ? tabFacets
    : tabFacets.slice(0, CATEGORY_CHIP_LIMIT)
  const hiddenFacetCount = tabFacets.length - visibleFacets.length

  const curatedCount = items.filter((item) => item.kind === 'curated').length
  const feedCount = items.length - curatedCount

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const fresh = await readJson<ResearchListResponse>(
        '/api/research/list?refresh=1',
      )
      queryClient.setQueryData(['research', 'list'], fresh)
      await queryClient.invalidateQueries({ queryKey: ['research', 'search'] })
    } finally {
      setRefreshing(false)
    }
  }

  function switchTab(next: ResearchKind) {
    setTab(next)
    setCategory(null)
  }

  const hasFilters = Boolean(category || sourceType || decision) || range !== 'all'

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="shrink-0 space-y-3 border-primary-200 border-b p-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-semibold text-lg text-primary-900">Research</h1>

            <div className="flex rounded-lg border border-primary-200 p-0.5">
              <button
                type="button"
                onClick={() => switchTab('curated')}
                className={cn(
                  'rounded-md px-3 py-1 text-xs transition',
                  tab === 'curated'
                    ? 'bg-primary-200 text-primary-900'
                    : 'text-primary-600 hover:text-primary-900',
                )}
              >
                Library
                <span className="ml-1.5 tabular-nums opacity-60">
                  {curatedCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => switchTab('feed')}
                className={cn(
                  'rounded-md px-3 py-1 text-xs transition',
                  tab === 'feed'
                    ? 'bg-primary-200 text-primary-900'
                    : 'text-primary-600 hover:text-primary-900',
                )}
              >
                Daily Feeds
                <span className="ml-1.5 tabular-nums opacity-60">
                  {feedCount}
                </span>
              </button>
            </div>

            <div className="relative ml-auto min-w-56 flex-1 sm:max-w-sm">
              <HugeiconsIcon
                icon={Search01Icon}
                className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-primary-500"
              />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search titles and full text…"
                className="w-full rounded-lg border border-primary-200 bg-primary-100 py-1.5 pr-3 pl-8 text-primary-900 text-sm placeholder:text-primary-500 focus:border-primary-500 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary-200 px-2.5 py-1.5 text-primary-700 text-xs hover:bg-primary-200 disabled:opacity-50"
            >
              <HugeiconsIcon
                icon={RefreshIcon}
                className={cn('size-3.5', refreshing && 'animate-spin')}
              />
              {refreshing ? 'Rescanning…' : 'Rescan'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {RANGE_OPTIONS.map((option) => (
              <FilterChip
                key={option.id}
                active={range === option.id}
                onClick={() => setRange(option.id)}
              >
                {option.label}
              </FilterChip>
            ))}

            <span className="mx-1 h-4 w-px bg-primary-200" aria-hidden />

            {visibleFacets.map((entry) => (
              <FilterChip
                key={entry.id}
                active={category === entry.id}
                onClick={() =>
                  setCategory(category === entry.id ? null : entry.id)
                }
              >
                {entry.label}
                <span className="ml-1 tabular-nums opacity-60">
                  {entry.count}
                </span>
              </FilterChip>
            ))}

            {hiddenFacetCount > 0 || showAllCategories ? (
              <button
                type="button"
                onClick={() => setShowAllCategories((value) => !value)}
                className="text-primary-500 text-xs underline hover:text-primary-900"
              >
                {showAllCategories ? 'Show fewer' : `+${hiddenFacetCount} more`}
              </button>
            ) : null}

            {(facets?.decisions ?? []).length > 0 ? (
              <>
                <span className="mx-1 h-4 w-px bg-primary-200" aria-hidden />
                {(facets?.decisions ?? []).map((entry) => (
                  <FilterChip
                    key={entry.id}
                    active={decision === entry.id}
                    onClick={() =>
                      setDecision(decision === entry.id ? null : entry.id)
                    }
                  >
                    {entry.id}
                  </FilterChip>
                ))}
              </>
            ) : null}

            <span className="mx-1 h-4 w-px bg-primary-200" aria-hidden />

            {(facets?.sourceTypes ?? []).map((entry) => (
              <FilterChip
                key={entry.id}
                active={sourceType === entry.id}
                onClick={() =>
                  setSourceType(sourceType === entry.id ? null : entry.id)
                }
              >
                {SOURCE_LABELS[entry.id]}
              </FilterChip>
            ))}

            {hasFilters ? (
              <button
                type="button"
                onClick={() => {
                  setCategory(null)
                  setSourceType(null)
                  setDecision(null)
                  setRange('all')
                }}
                className="ml-1 text-primary-500 text-xs underline hover:text-primary-900"
              >
                Clear
              </button>
            ) : null}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {listQuery.isPending ? (
            <p className="text-primary-600 text-sm">Indexing research library…</p>
          ) : listQuery.isError ? (
            <p className="text-rose-600 text-sm">
              {listQuery.error instanceof Error
                ? listQuery.error.message
                : 'Failed to load the research library.'}
            </p>
          ) : !exists ? (
            <div className="rounded-xl border border-primary-200 border-dashed p-6 text-center">
              <p className="text-primary-900 text-sm">
                Research library not found.
              </p>
              <p className="mt-1 text-primary-600 text-xs">
                Expected at <code>{root}</code>. Set <code>RESEARCH_DIR</code> to
                point somewhere else.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-primary-600 text-sm">
              No research matches these filters.
            </p>
          ) : (
            <div className="space-y-8">
              {recent.length > 0 && range === 'all' && !category ? (
                <CollapsibleSection
                  title="New this week"
                  count={recent.length}
                  defaultOpen
                >
                  <CardGrid
                    items={recent}
                    selectedPath={selected?.path ?? null}
                    onSelect={setSelected}
                  />
                </CollapsibleSection>
              ) : null}

              {grouped.map(([label, groupItems], index) => (
                <CollapsibleSection
                  key={label}
                  title={label}
                  count={groupItems.length}
                  defaultOpen={tab === 'curated' || index < 2}
                >
                  <CardGrid
                    items={groupItems}
                    selectedPath={selected?.path ?? null}
                    onSelect={setSelected}
                  />
                </CollapsibleSection>
              ))}
            </div>
          )}
        </div>
      </div>

      {selected ? (
        <div className="hidden min-h-0 w-[38rem] max-w-[45vw] shrink-0 lg:block">
          <ResearchDetail item={selected} onClose={() => setSelected(null)} />
        </div>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden">
          <div className="absolute inset-y-0 right-0 w-full max-w-lg">
            <ResearchDetail item={selected} onClose={() => setSelected(null)} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
