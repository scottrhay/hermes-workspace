'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import type {
  OEDetailResponse,
  OEForgeDimension,
  OEListResponse,
  OEReceipt,
  OEWorkItem,
  OEWorkItemDetail,
} from './oe-types'
import { STATUS_ORDER, prioritySort, statusLabel } from './oe-types'

const DEFAULT_OPENENGINE_URL = 'http://127.0.0.1:5227/dashboard'

export const OPENENGINE_DASHBOARD_URL =
  ((import.meta as any).env?.VITE_OPENENGINE_URL as string | undefined) ||
  DEFAULT_OPENENGINE_URL

const QUERY_KEY = ['oe', 'work-items'] as const
const DETAIL_QUERY_KEY = (id: string) => ['oe', 'work-item', id] as const

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

export async function fetchWorkItems(): Promise<OEWorkItem[]> {
  const res = await fetch('/api/openengine-work-items')
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string
      detail?: string
    } | null
    throw new Error(body?.error ?? `HTTP ${res.status}`)
  }
  const data = (await res.json()) as OEListResponse
  if (!data.ok) throw new Error(data.error)
  return data.items
}

async function fetchWorkItemDetail(id: string): Promise<OEWorkItemDetail> {
  const res = await fetch(`/api/openengine-work-items/${encodeURIComponent(id)}`)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(body?.error ?? `HTTP ${res.status}`)
  }
  const data = (await res.json()) as OEDetailResponse
  if (!data.ok) throw new Error(data.error)
  return data.item
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface OEFilters {
  search: string
  owner: string
  status: string
  type: string
  priority: string
}

const EMPTY_FILTERS: OEFilters = {
  search: '',
  owner: '',
  status: '',
  type: '',
  priority: '',
}

function applyFilters(items: OEWorkItem[], filters: OEFilters): OEWorkItem[] {
  const search = filters.search.trim().toLowerCase()
  return items.filter((item) => {
    if (
      search &&
      !item.title.toLowerCase().includes(search) &&
      !(item.summary ?? '').toLowerCase().includes(search)
    )
      return false
    if (filters.owner && item.owner !== filters.owner) return false
    if (filters.status && item.status !== filters.status) return false
    if (filters.type && item.type !== filters.type) return false
    if (filters.priority && item.priority !== filters.priority) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatRelative(iso: string): string {
  try {
    const timestamp = new Date(iso).getTime()
    if (!iso || Number.isNaN(timestamp)) return '—'
    const ms = Date.now() - timestamp
    if (ms < 60_000) return 'just now'
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
    return `${Math.floor(ms / 86_400_000)}d ago`
  } catch {
    return iso
  }
}

function priorityColor(priority: string | null): string {
  switch (priority) {
    case 'urgent':
    case 'P0':
      return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'P1':
    case 'high':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    case 'P2':
    case 'medium':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    default:
      return 'bg-[var(--theme-surface-2)] text-[var(--theme-muted)] border-[var(--theme-border)]'
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'in_progress':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'blocked':
      return 'bg-red-500/20 text-red-400 border-red-500/30'
    case 'human_hold':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    case 'review_requested':
    case 'changes_requested':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 'ready':
      return 'bg-green-500/20 text-green-400 border-green-500/30'
    case 'closed':
      return 'bg-[var(--theme-surface-2)] text-[var(--theme-muted)] border-[var(--theme-border)]'
    case 'cancelled':
      return 'bg-[var(--theme-surface-2)] text-[var(--theme-muted)] border-[var(--theme-border)] opacity-60'
    default:
      return 'bg-[var(--theme-surface-2)] text-[var(--theme-muted)] border-[var(--theme-border)]'
  }
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface CardProps {
  item: OEWorkItem
  selected: boolean
  onSelect: (id: string) => void
}

function OECard({ item, selected, onSelect }: CardProps) {
  return (
    <button
      type="button"
      data-testid="oe-card"
      onClick={() => onSelect(item.id)}
      className={cn(
        'group w-full rounded-lg border px-3 py-2.5 text-left transition-all',
        selected
          ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)]/10'
          : 'border-[var(--theme-border)] bg-[var(--theme-surface-2)] hover:border-[var(--theme-accent)]/50',
      )}
    >
      {/* Status + priority row */}
      <div className="mb-1.5 flex items-center gap-1.5 flex-wrap">
        <span
          className={cn(
            'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium',
            statusColor(item.status),
          )}
        >
          {statusLabel(item.status)}
        </span>
        {item.priority && (
          <span
            className={cn(
              'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium',
              priorityColor(item.priority),
            )}
          >
            {item.priority}
          </span>
        )}
        {item.tier && (
          <span className="inline-flex items-center rounded border border-[var(--theme-border)] bg-[var(--theme-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--theme-muted)]">
            {item.tier}
          </span>
        )}
        {item.workflowMode && (
          <span className="inline-flex items-center rounded border border-[var(--theme-border)] bg-[var(--theme-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--theme-muted)]">
            {item.workflowMode}
          </span>
        )}
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-ink leading-snug line-clamp-2">{item.title}</p>

      {/* Meta row */}
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--theme-muted)]">
        {item.owner && (
          <span className="truncate max-w-[8rem]" title={item.owner}>
            {item.owner}
          </span>
        )}
        {item.type && (
          <span className="shrink-0 uppercase text-[10px] opacity-70">{item.type}</span>
        )}
        <span className="ml-auto shrink-0">{formatRelative(item.updatedAt)}</span>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

interface ColumnProps {
  status: string
  items: OEWorkItem[]
  selectedId: string | null
  onSelect: (id: string) => void
}

function OEColumn({ status, items, selectedId, onSelect }: ColumnProps) {
  return (
    <div className="flex shrink-0 flex-col w-64" data-testid={`column-${status}`}>
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-xs font-semibold text-ink">{statusLabel(status)}</span>
        <span className="rounded-full bg-[var(--theme-surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--theme-muted)]">
          {items.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <OECard
            key={item.id}
            item={item}
            selected={selectedId === item.id}
            onSelect={onSelect}
          />
        ))}
        {items.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--theme-border)] px-3 py-4 text-center text-xs text-[var(--theme-muted)]">
            Empty
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function ReceiptItem({ receipt }: { receipt: OEReceipt }) {
  return (
    <div className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-surface-2)] p-3">
      <div className="mb-1 flex items-center gap-2 text-[11px] text-[var(--theme-muted)]">
        <span className="font-medium">{receipt.receiptType}</span>
        <span>·</span>
        <span>{receipt.actor}</span>
        <span className="ml-auto">{formatRelative(receipt.createdAt)}</span>
      </div>
      {receipt.summary && (
        <p className="text-xs text-ink leading-relaxed">{receipt.summary}</p>
      )}
    </div>
  )
}

function ForgeBadge({ dim }: { dim: OEForgeDimension }) {
  const colorClass =
    dim.status === 'green'
      ? 'bg-green-500/20 text-green-400 border-green-500/30'
      : dim.status === 'yellow'
        ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
        : dim.status === 'red'
          ? 'bg-red-500/20 text-red-400 border-red-500/30'
          : 'bg-[var(--theme-surface-2)] text-[var(--theme-muted)] border-[var(--theme-border)]'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize',
        colorClass,
      )}
      title={dim.notes || undefined}
    >
      {dim.dimension}
    </span>
  )
}

interface DetailPanelProps {
  itemId: string | null
  onClose: () => void
}

function DetailPanel({ itemId, onClose }: DetailPanelProps) {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: DETAIL_QUERY_KEY(itemId ?? ''),
    queryFn: () => fetchWorkItemDetail(itemId!),
    enabled: !!itemId,
    staleTime: 15_000,
  })

  if (!itemId) return null

  return (
    <aside
      data-testid="detail-panel"
      className="flex h-full w-80 shrink-0 flex-col border-l border-[var(--theme-border)] bg-surface"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--theme-border)] px-4 py-3">
        <span className="text-xs font-semibold text-ink">Detail</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          className="rounded p-1 text-[var(--theme-muted)] hover:text-ink"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-12" data-testid="detail-loading">
            <span className="text-xs text-[var(--theme-muted)]">Loading…</span>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 py-8" data-testid="detail-error">
            <p className="text-xs text-red-400">
              {error instanceof Error ? error.message : 'Failed to load detail'}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded border border-[var(--theme-border)] px-3 py-1.5 text-xs text-[var(--theme-muted)] hover:text-ink"
            >
              Retry
            </button>
            <a
              href={OPENENGINE_DASHBOARD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--theme-accent)] underline"
            >
              Open canonical dashboard ↗
            </a>
          </div>
        )}

        {data && (
          <div className="flex flex-col gap-4">
            {/* Status + priority */}
            <div className="flex flex-wrap gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium',
                  statusColor(data.status),
                )}
              >
                {statusLabel(data.status)}
              </span>
              {data.priority && (
                <span
                  className={cn(
                    'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium',
                    priorityColor(data.priority),
                  )}
                >
                  {data.priority}
                </span>
              )}
              {data.tier && (
                <span className="inline-flex items-center rounded border border-[var(--theme-border)] bg-[var(--theme-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--theme-muted)]">
                  {data.tier}
                </span>
              )}
              {data.type && (
                <span className="inline-flex items-center rounded border border-[var(--theme-border)] bg-[var(--theme-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--theme-muted)]">
                  {data.type}
                </span>
              )}
            </div>

            {/* Title */}
            <h2 className="text-sm font-semibold text-ink leading-snug">{data.title}</h2>

            {/* Owner / created_by */}
            {(data.owner || data.createdBy) && (
              <div className="text-xs text-[var(--theme-muted)]">
                {data.owner && <span>Owner: {data.owner}</span>}
                {data.createdBy && data.createdBy !== data.owner && (
                  <span> · Created by: {data.createdBy}</span>
                )}
              </div>
            )}

            {/* Updated */}
            {data.updatedAt && (
              <div className="text-xs text-[var(--theme-muted)]">
                Updated {formatRelative(data.updatedAt)}
              </div>
            )}

            {/* Summary */}
            {data.summary && (
              <section>
                <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--theme-muted)]">
                  Summary
                </h3>
                <p className="text-xs text-ink leading-relaxed">{data.summary}</p>
              </section>
            )}

            {/* Acceptance criteria (when present) */}
            {data.acceptanceCriteria && (
              <section>
                <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--theme-muted)]">
                  Acceptance Criteria
                </h3>
                <p className="whitespace-pre-wrap text-xs text-ink leading-relaxed">
                  {data.acceptanceCriteria}
                </p>
              </section>
            )}

            {/* Latest receipt / progress */}
            {data.latestReceipt && (
              <section>
                <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--theme-muted)]">
                  Latest Progress
                </h3>
                <ReceiptItem receipt={data.latestReceipt} />
              </section>
            )}

            {/* All receipts */}
            {data.receipts.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--theme-muted)]">
                  Receipts ({data.receipts.length})
                </h3>
                <div className="flex flex-col gap-2">
                  {data.receipts.map((r) => (
                    <ReceiptItem key={r.id} receipt={r} />
                  ))}
                </div>
              </section>
            )}

            {/* FORGE dimensions */}
            {data.forgeDimensions.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--theme-muted)]">
                  FORGE Dimensions
                </h3>
                <div className="flex flex-wrap gap-1">
                  {data.forgeDimensions
                    .filter((d) => d.applicable)
                    .map((d) => (
                      <ForgeBadge key={d.dimension} dim={d} />
                    ))}
                </div>
              </section>
            )}

            {/* Canonical dashboard link */}
            <div className="border-t border-[var(--theme-border)] pt-3">
              <a
                href={OPENENGINE_DASHBOARD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--theme-accent)] hover:underline"
              >
                Open canonical dashboard ↗
              </a>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

interface FilterBarProps {
  items: OEWorkItem[]
  filters: OEFilters
  onChange: (filters: OEFilters) => void
}

function FilterBar({ items, filters, onChange }: FilterBarProps) {
  const owners = useMemo(
    () => [...new Set(items.map((i) => i.owner).filter(Boolean))].sort() as string[],
    [items],
  )
  const types = useMemo(
    () => [...new Set(items.map((i) => i.type).filter(Boolean))].sort() as string[],
    [items],
  )
  const priorities = useMemo(
    () =>
      [...new Set(items.map((i) => i.priority).filter(Boolean))].sort((a, b) =>
        prioritySort(a, b),
      ) as string[],
    [items],
  )
  const statuses = useMemo(() => {
    const live = [...new Set(items.map((i) => i.status))]
    return [
      ...STATUS_ORDER.filter((status) => live.includes(status)),
      ...live.filter((status) => !STATUS_ORDER.includes(status)).sort(),
    ]
  }, [items])

  const update = <K extends keyof OEFilters>(key: K, value: OEFilters[K]) =>
    onChange({ ...filters, [key]: value })

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <input
        type="search"
        placeholder="Search…"
        value={filters.search}
        onChange={(e) => update('search', e.target.value)}
        aria-label="Search tasks"
        className="h-7 rounded border border-[var(--theme-border)] bg-[var(--theme-surface-2)] px-2.5 text-xs text-ink placeholder:text-[var(--theme-muted)] focus:border-[var(--theme-accent)] focus:outline-none w-40"
      />

      {/* Owner */}
      <select
        value={filters.owner}
        onChange={(e) => update('owner', e.target.value)}
        aria-label="Filter by owner"
        className="h-7 rounded border border-[var(--theme-border)] bg-[var(--theme-surface-2)] px-2 text-xs text-ink focus:border-[var(--theme-accent)] focus:outline-none"
      >
        <option value="">All owners</option>
        {owners.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>

      {/* Status */}
      <select
        value={filters.status}
        onChange={(e) => update('status', e.target.value)}
        aria-label="Filter by status"
        className="h-7 rounded border border-[var(--theme-border)] bg-[var(--theme-surface-2)] px-2 text-xs text-ink focus:border-[var(--theme-accent)] focus:outline-none"
      >
        <option value="">All statuses</option>
        {statuses.map((s) => (
          <option key={s} value={s}>
            {statusLabel(s)}
          </option>
        ))}
      </select>

      {/* Type */}
      <select
        value={filters.type}
        onChange={(e) => update('type', e.target.value)}
        aria-label="Filter by type"
        className="h-7 rounded border border-[var(--theme-border)] bg-[var(--theme-surface-2)] px-2 text-xs text-ink focus:border-[var(--theme-accent)] focus:outline-none"
      >
        <option value="">All types</option>
        {types.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      {/* Priority */}
      <select
        value={filters.priority}
        onChange={(e) => update('priority', e.target.value)}
        aria-label="Filter by priority"
        className="h-7 rounded border border-[var(--theme-border)] bg-[var(--theme-surface-2)] px-2 text-xs text-ink focus:border-[var(--theme-accent)] focus:outline-none"
      >
        <option value="">All priorities</option>
        {priorities.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      {/* Clear filters */}
      {(filters.search ||
        filters.owner ||
        filters.status ||
        filters.type ||
        filters.priority) && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="h-7 rounded border border-[var(--theme-border)] px-2.5 text-xs text-[var(--theme-muted)] hover:text-ink"
        >
          Clear
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main TasksScreen
// ---------------------------------------------------------------------------

export function TasksScreen() {
  const [filters, setFilters] = useState<OEFilters>(EMPTY_FILTERS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const boardRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, isError, error, dataUpdatedAt, isFetching, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchWorkItems,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
    retryDelay: 0,
  })

  const lastSuccess = useMemo(
    () => (dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null),
    [dataUpdatedAt],
  )

  const filteredItems = useMemo(
    () => applyFilters(data ?? [], filters),
    [data, filters],
  )

  const columns = useMemo(() => {
    const grouped: Map<string, OEWorkItem[]> = new Map()

    for (const item of filteredItems) {
      const col = grouped.get(item.status) ?? []
      col.push(item)
      grouped.set(item.status, col)
    }

    // Sort items in each column by priority
    for (const [, col] of grouped) {
      col.sort((a, b) => prioritySort(a.priority, b.priority))
    }

    // Return in canonical STATUS_ORDER plus any unknown statuses
    const known = STATUS_ORDER.filter((s) => grouped.has(s)).map((s) => ({
      status: s,
      items: grouped.get(s)!,
    }))
    const extra = [...grouped.keys()]
      .filter((s) => !STATUS_ORDER.includes(s))
      .map((s) => ({ status: s, items: grouped.get(s)! }))

    return [...known, ...extra]
  }, [filteredItems])

  const handleRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
  }, [queryClient])

  // Close detail when clicking outside (keyboard: Escape)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const totalVisible = filteredItems.length
  const totalAll = data?.length ?? 0

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface text-ink">
      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--theme-border)] px-4 py-3 sm:px-6">
        <div className="min-w-0 mr-auto">
          <h1 className="text-xl font-medium text-ink">Tasks</h1>
          <p className="text-xs text-[var(--theme-muted)]">
            OpenEngine task board
            {lastSuccess && !isLoading && (
              <span> · last updated {lastSuccess}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isFetching}
            aria-label="Refresh"
            className={cn(
              'rounded border border-[var(--theme-border)] px-3 py-1.5 text-xs text-[var(--theme-muted)] transition-colors hover:text-ink',
              isFetching && 'opacity-50 cursor-not-allowed',
            )}
          >
            {isFetching ? '…' : '↺ Refresh'}
          </button>

          {/* Canonical dashboard link */}
          <a
            href={OPENENGINE_DASHBOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-lg border border-[var(--theme-border)] px-3 py-1.5 text-xs font-medium text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-text)]"
          >
            Open canonical dashboard ↗
          </a>
        </div>
      </header>

      {/* Filter bar */}
      {data && data.length > 0 && (
        <div className="shrink-0 border-b border-[var(--theme-border)] px-4 py-2 sm:px-6">
          <FilterBar items={data} filters={filters} onChange={setFilters} />
        </div>
      )}

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Board area */}
        <div className="min-h-0 flex-1 overflow-auto" ref={boardRef}>
          {/* Loading */}
          {isLoading && (
            <div
              className="flex h-full items-center justify-center"
              data-testid="board-loading"
            >
              <span className="text-xs text-[var(--theme-muted)]">Loading…</span>
            </div>
          )}

          {/* Error / offline */}
          {isError && (
            <div
              className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
              data-testid="board-error"
            >
              <p className="text-sm font-medium text-ink">
                OpenEngine is unavailable
              </p>
              <p className="max-w-sm text-xs text-[var(--theme-muted)]">
                {error instanceof Error ? error.message : 'Failed to fetch tasks'}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="rounded border border-[var(--theme-border)] px-3 py-1.5 text-xs text-[var(--theme-muted)] hover:text-ink"
                >
                  Retry
                </button>
                <a
                  href={OPENENGINE_DASHBOARD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-[var(--theme-border)] px-3 py-1.5 text-xs text-[var(--theme-muted)] hover:text-ink"
                >
                  Open canonical dashboard ↗
                </a>
              </div>
            </div>
          )}

          {/* Empty */}
          {!isLoading && !isError && data && totalAll === 0 && (
            <div
              className="flex h-full items-center justify-center"
              data-testid="board-empty"
            >
              <p className="text-xs text-[var(--theme-muted)]">No work items found</p>
            </div>
          )}

          {/* Filtered empty */}
          {!isLoading && !isError && data && totalAll > 0 && totalVisible === 0 && (
            <div
              className="flex h-full items-center justify-center"
              data-testid="board-filtered-empty"
            >
              <p className="text-xs text-[var(--theme-muted)]">
                No items match the current filters
              </p>
            </div>
          )}

          {/* Kanban columns */}
          {!isLoading && !isError && columns.length > 0 && (
            <div className="flex h-full gap-4 p-4">
              {columns.map(({ status, items }) => (
                <OEColumn
                  key={status}
                  status={status}
                  items={items}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedId && (
          <DetailPanel itemId={selectedId} onClose={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  )
}
