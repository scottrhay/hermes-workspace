import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  Copy01Icon,
  File01Icon,
  LinkSquare02Icon,
} from '@hugeicons/core-free-icons'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Markdown } from '@/components/prompt-kit/markdown'
import { cn } from '@/lib/utils'
import { formatCardDate } from './research-card'
import type { ResearchItem, ResearchReadResponse } from './research-types'

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Request failed (${response.status})`)
  }
  return (await response.json()) as T
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function ResearchDetail({
  item,
  onClose,
}: {
  item: ResearchItem
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const readQuery = useQuery({
    queryKey: ['research', 'read', item.path],
    queryFn: () =>
      readJson<ResearchReadResponse>(
        `/api/research/read?path=${encodeURIComponent(item.path)}`,
      ),
  })

  const content = readQuery.data?.content ?? ''

  function handleCopyPath() {
    void navigator.clipboard.writeText(item.path).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-primary-200 border-l bg-primary-50">
      <header className="flex shrink-0 items-start gap-2 border-primary-200 border-b p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-primary-600 text-xs">
            <span className="truncate">{item.categoryLabel}</span>
            <span aria-hidden>·</span>
            <span className="shrink-0 tabular-nums">
              {formatCardDate(item.date)}
            </span>
            <span aria-hidden>·</span>
            <span className="shrink-0">{formatBytes(item.size)}</span>
          </div>
          <h2 className="mt-1 font-semibold text-primary-900 text-base leading-snug">
            {item.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-md p-1.5 text-primary-600 hover:bg-primary-200"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </button>
      </header>

      <div className="flex shrink-0 flex-wrap gap-2 border-primary-200 border-b px-4 py-2">
        {item.sourceUrl ? (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-md border border-primary-200 px-2 py-1 text-primary-700 text-xs hover:bg-primary-200"
          >
            <HugeiconsIcon icon={LinkSquare02Icon} className="size-3.5" />
            Open source
          </a>
        ) : null}
        <button
          type="button"
          onClick={handleCopyPath}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary-200 px-2 py-1 text-primary-700 text-xs hover:bg-primary-200"
        >
          <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
          {copied ? 'Copied' : 'Copy path'}
        </button>
        <a
          href={`/files?path=${encodeURIComponent(item.path)}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-primary-200 px-2 py-1 text-primary-700 text-xs hover:bg-primary-200"
        >
          <HugeiconsIcon icon={File01Icon} className="size-3.5" />
          Open in Files
        </a>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {readQuery.isPending ? (
          <p className="text-primary-600 text-sm">Loading…</p>
        ) : readQuery.isError ? (
          <p className="text-rose-600 text-sm">
            {readQuery.error instanceof Error
              ? readQuery.error.message
              : 'Failed to load this document.'}
          </p>
        ) : (
          <Markdown className={cn('max-w-none text-sm')}>{content}</Markdown>
        )}
      </div>

      <footer className="shrink-0 border-primary-200 border-t px-4 py-2">
        <code className="block truncate text-[11px] text-primary-500">
          {item.path}
        </code>
      </footer>
    </aside>
  )
}
