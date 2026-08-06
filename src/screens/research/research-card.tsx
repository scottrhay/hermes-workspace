import { HugeiconsIcon } from '@hugeicons/react'
import {
  File01Icon,
  Globe02Icon,
  Linkedin01Icon,
  NewTwitterIcon,
  YoutubeIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import type {
  ResearchDecision,
  ResearchItem,
  ResearchSourceType,
} from './research-types'

const SOURCE_ICONS: Record<ResearchSourceType, typeof File01Icon> = {
  youtube: YoutubeIcon,
  x: NewTwitterIcon,
  linkedin: Linkedin01Icon,
  medium: Globe02Icon,
  substack: Globe02Icon,
  web: Globe02Icon,
  internal: File01Icon,
}

const SOURCE_LABELS: Record<ResearchSourceType, string> = {
  youtube: 'YouTube',
  x: 'X',
  linkedin: 'LinkedIn',
  medium: 'Medium',
  substack: 'Substack',
  web: 'Web',
  internal: 'Internal',
}

const DECISION_STYLES: Record<ResearchDecision, string> = {
  'ADOPT NOW':
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'TEST NEXT':
    'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  MONITOR:
    'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'REFERENCE ONLY':
    'border-primary-400/40 bg-primary-400/10 text-primary-700 dark:text-primary-300',
  REJECT: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
}

export function formatCardDate(date: string): string {
  const parsed = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed)) return date
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed)
}

export function ResearchCard({
  item,
  selected,
  onSelect,
}: {
  item: ResearchItem
  selected: boolean
  onSelect: (item: ResearchItem) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={cn(
        'flex h-full flex-col gap-2 rounded-xl border p-4 text-left transition',
        'border-primary-200 bg-primary-100 hover:border-primary-400',
        selected && 'border-primary-500 ring-1 ring-primary-500',
      )}
    >
      {/* The icon carries the source type so the category keeps the room it
          needs — at three columns a text label truncated both to "Da…". */}
      <div className="flex items-center gap-1.5 text-primary-600 text-xs">
        <HugeiconsIcon
          icon={SOURCE_ICONS[item.sourceType]}
          className="size-3.5 shrink-0"
        />
        <span className="sr-only">{SOURCE_LABELS[item.sourceType]}</span>
        <span className="min-w-0 truncate" title={item.categoryLabel}>
          {item.categoryLabel}
        </span>
        <span className="ml-auto shrink-0 tabular-nums">
          {formatCardDate(item.date)}
        </span>
      </div>

      <h3 className="line-clamp-2 font-medium text-primary-900 text-sm leading-snug">
        {item.title}
      </h3>

      {item.summary ? (
        <p className="line-clamp-3 text-primary-600 text-xs leading-relaxed">
          {item.summary}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        {item.decision ? (
          <span
            className={cn(
              'rounded border px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide',
              DECISION_STYLES[item.decision],
            )}
          >
            {item.decision}
            {item.evidence ? ` · ${item.evidence}` : ''}
          </span>
        ) : null}
        {item.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded bg-primary-200 px-1.5 py-0.5 text-[10px] text-primary-700"
          >
            {tag}
          </span>
        ))}
      </div>
    </button>
  )
}
