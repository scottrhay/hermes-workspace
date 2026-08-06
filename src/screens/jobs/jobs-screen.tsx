'use client'

import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Clock01Icon,
  Delete01Icon,
  PauseIcon,
  PencilEdit02Icon,
  PlayIcon,
  RefreshIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { CreateJobDialog } from './create-job-dialog'
import { EditJobDialog } from './edit-job-dialog'
import type { ClaudeJob } from '@/lib/jobs-api'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  createJob,
  deleteJob,
  fetchJobOutput,
  fetchJobProfiles,
  fetchJobs,
  pauseJob,
  resumeJob,
  triggerJob,
  updateJob,
} from '@/lib/jobs-api'

const QUERY_KEY = ['claude', 'jobs'] as const
const PROFILES_QUERY_KEY = ['claude', 'job-profiles'] as const
export const HISTORY_LIMIT = 50

function formatNextRun(nextRun?: string | null): string {
  if (!nextRun) return '—'
  try {
    const d = new Date(nextRun)
    const now = new Date()
    const diffMs = d.getTime() - now.getTime()
    if (diffMs < 0) return 'overdue'
    if (diffMs < 60_000) return 'in < 1m'
    if (diffMs < 3_600_000) return `in ${Math.round(diffMs / 60_000)}m`
    if (diffMs < 86_400_000) return `in ${Math.round(diffMs / 3_600_000)}h`
    return d.toLocaleDateString()
  } catch {
    return nextRun
  }
}

function formatTimestamp(value?: string | null): string {
  if (!value) return 'Never'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function getOutputPreview(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 200) return normalized
  return `${normalized.slice(0, 200).trimEnd()}…`
}

export function isJobActive(job: ClaudeJob): boolean {
  return job.enabled && job.state !== 'paused' && job.state !== 'completed'
}

function getStatusColor(job: ClaudeJob): string {
  if (!job.enabled || job.state === 'paused') return 'var(--theme-muted)'
  if (job.state === 'completed') return 'var(--theme-accent)'
  if (job.last_run_success === false) return 'var(--theme-danger)'
  return 'var(--theme-success)'
}

function getStatusLabel(job: ClaudeJob): string {
  const isPaused = !job.enabled || job.state === 'paused'
  const stateStr = typeof job.state === 'string' ? job.state : 'unknown'
  if (isPaused) return `${stateStr} (paused)`
  return stateStr
}

// Dense list row for left selector pane
function JobListRow({
  job,
  isSelected,
  onSelect,
}: {
  job: ClaudeJob
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const active = isJobActive(job)
  return (
    <button
      type="button"
      data-testid={`job-row-${job.id}`}
      aria-pressed={isSelected}
      onClick={() => onSelect(job.id)}
      className={cn(
        'w-full text-left px-3 py-2 text-sm transition-colors',
        'border-b border-[var(--theme-border)] last:border-b-0',
        'border-l-2',
        isSelected
          ? 'bg-[var(--theme-accent)]/10 border-l-[var(--theme-accent)]'
          : 'border-l-transparent hover:bg-[var(--theme-hover)]',
        !active && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="shrink-0 h-1.5 w-1.5 rounded-full"
          style={{ background: getStatusColor(job) }}
        />
        <span className="truncate text-xs font-medium text-[var(--theme-text)]">
          {job.name || '(unnamed)'}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--theme-muted)] pl-3.5">
        <span className="truncate">{job.schedule_display || 'custom'}</span>
        <span>·</span>
        <span className="shrink-0">Next {formatNextRun(job.next_run_at)}</span>
      </div>
    </button>
  )
}

// Metadata field with explicit "Unavailable" label when value is absent
function DetailField({
  label,
  value,
}: {
  label: string
  value: React.ReactNode | null | undefined
}) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-20 shrink-0 text-[var(--theme-muted)]">{label}</span>
      <span className="min-w-0 text-[var(--theme-text)]">
        {value != null && value !== '' ? (
          value
        ) : (
          <span
            className="italic text-[var(--theme-muted)]"
            data-testid={`field-unavailable-${label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            Unavailable
          </span>
        )}
      </span>
    </div>
  )
}

// Run history inside detail pane; keyed by jobId so state resets on selection change
export function RunHistory({ jobId }: { jobId: string }) {
  const [expandedRun, setExpandedRun] = useState<string | null>(null)

  const outputQuery = useQuery({
    queryKey: ['claude', 'jobs', jobId, 'output', HISTORY_LIMIT],
    queryFn: () => fetchJobOutput(jobId, HISTORY_LIMIT),
    staleTime: 30_000,
  })

  if (outputQuery.isLoading) {
    return (
      <div
        className="px-4 py-3 text-xs text-[var(--theme-muted)]"
        data-testid="history-loading"
      >
        Loading run history…
      </div>
    )
  }

  if (outputQuery.isError) {
    return (
      <div
        className="px-4 py-3 text-xs"
        style={{ color: 'var(--theme-danger)' }}
        data-testid="history-error"
      >
        History unavailable:{' '}
        {outputQuery.error instanceof Error
          ? outputQuery.error.message
          : 'Unknown error'}
      </div>
    )
  }

  const outputs = outputQuery.data ?? []
  if (outputs.length === 0) {
    return (
      <div
        className="px-4 py-3 text-xs text-[var(--theme-muted)]"
        data-testid="history-empty"
      >
        No run history yet.
      </div>
    )
  }

  return (
    <div className="space-y-1.5 px-4 pb-4" data-testid="history-list">
      {outputs.map((output) => {
        const runKey = `${output.filename}-${output.timestamp}`
        const isRunExpanded = expandedRun === runKey
        const toggleRun = (e: React.MouseEvent) => {
          e.stopPropagation()
          setExpandedRun((current) => (current === runKey ? null : runKey))
        }
        return (
          <div
            key={runKey}
            className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)]"
            data-testid={`run-row-${runKey}`}
          >
            <button
              type="button"
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[10px] text-[var(--theme-muted)]"
              onClick={toggleRun}
              aria-expanded={isRunExpanded}
            >
              <span>{formatTimestamp(output.timestamp)}</span>
              <span className="flex items-center gap-1 min-w-0">
                <span className="shrink-0">
                  {Number.isFinite(output.size)
                    ? `${output.size.toLocaleString()} B`
                    : '—'}
                </span>
                <HugeiconsIcon
                  icon={isRunExpanded ? ArrowUp01Icon : ArrowDown01Icon}
                  size={10}
                  className="shrink-0 text-[var(--theme-muted)]"
                />
              </span>
            </button>
            {isRunExpanded ? (
              <div className="px-3 pb-3" data-testid={`run-expanded-${runKey}`}>
                <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-[var(--theme-text)]">
                  {output.content || 'No output content'}
                </pre>
              </div>
            ) : (
              output.content && (
                <p className="px-3 pb-2 text-xs text-[var(--theme-muted)] leading-5 line-clamp-2">
                  {getOutputPreview(output.content)}
                </p>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}

// Detail pane for a single selected job
function JobDetailPane({
  job,
  onPause,
  onResume,
  onTrigger,
  onEdit,
  onDelete,
  triggerPending,
}: {
  job: ClaudeJob
  onPause: (id: string) => void
  onResume: (id: string) => void
  onTrigger: (id: string) => void
  onEdit: (job: ClaudeJob) => void
  onDelete: (id: string) => void
  triggerPending: boolean
}) {
  const isPaused = !job.enabled || job.state === 'paused'
  const deliveryDisplay =
    job.deliver && job.deliver.length > 0 ? job.deliver.join(', ') : null
  const skillsDisplay =
    job.skills && job.skills.length > 0 ? job.skills.join(', ') : null
  const mode = (job as ClaudeJob & { mode?: string }).mode ?? null

  return (
    <div className="flex flex-col h-full" data-testid="job-detail-pane">
      {/* Header: name, status, actions */}
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-[var(--theme-border)] shrink-0">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[var(--theme-text)]">
            {job.name || '(unnamed)'}
          </h2>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: getStatusColor(job) }}
            />
            <span className="text-[10px] text-[var(--theme-muted)]">
              {getStatusLabel(job)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 pt-0.5">
          <button
            type="button"
            disabled={triggerPending}
            onClick={(e) => {
              e.stopPropagation()
              onTrigger(job.id)
            }}
            className="rounded-lg p-1.5 transition-colors hover:bg-[var(--theme-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            title="Run now"
            data-testid="action-run"
          >
            <HugeiconsIcon
              icon={PlayIcon}
              size={14}
              className="text-[var(--theme-accent)]"
            />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (isPaused) onResume(job.id)
              else onPause(job.id)
            }}
            className="rounded-lg p-1.5 transition-colors hover:bg-[var(--theme-hover)]"
            title={isPaused ? 'Resume' : 'Pause'}
            data-testid="action-pause-resume"
          >
            <HugeiconsIcon
              icon={isPaused ? PlayIcon : PauseIcon}
              size={14}
              className="text-[var(--theme-muted)]"
            />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onEdit(job)
            }}
            className="rounded-lg p-1.5 transition-colors hover:bg-[var(--theme-hover)]"
            title="Edit"
            data-testid="action-edit"
          >
            <HugeiconsIcon
              icon={PencilEdit02Icon}
              size={14}
              className="text-[var(--theme-muted)]"
            />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(job.id)
            }}
            className="rounded-lg p-1.5 transition-colors hover:bg-[var(--theme-hover)]"
            title="Delete"
            data-testid="action-delete"
          >
            <HugeiconsIcon
              icon={Delete01Icon}
              size={14}
              style={{ color: 'var(--theme-danger)' }}
            />
          </button>
        </div>
      </div>

      {/* Metadata */}
      <div
        className="space-y-1.5 px-4 py-3 border-b border-[var(--theme-border)] shrink-0"
        data-testid="detail-metadata"
      >
        <DetailField label="Schedule" value={job.schedule_display ?? null} />
        <DetailField
          label="Next run"
          value={job.next_run_at ? formatNextRun(job.next_run_at) : 'Never'}
        />
        <DetailField
          label="Last run"
          value={
            job.last_run_at ? formatTimestamp(job.last_run_at) : 'Never'
          }
        />
        <DetailField label="Delivery" value={deliveryDisplay} />
        <DetailField label="Mode" value={mode} />
        <DetailField label="Profile" value={job.profile ?? null} />
        <DetailField label="Skills" value={skillsDisplay} />
      </div>

      {/* Prompt */}
      <div
        className="px-4 py-3 border-b border-[var(--theme-border)] shrink-0"
        data-testid="detail-prompt"
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--theme-muted)] mb-1.5">
          Prompt
        </p>
        {job.prompt ? (
          <p className="text-xs text-[var(--theme-text)] leading-relaxed">
            {job.prompt}
          </p>
        ) : (
          <span className="italic text-xs text-[var(--theme-muted)]">
            Unavailable
          </span>
        )}
      </div>

      {/* Run history */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 py-2 text-[9px] font-semibold uppercase tracking-wider text-[var(--theme-muted)] border-b border-[var(--theme-border)] sticky top-0 bg-[var(--theme-card,var(--theme-bg))]">
          Run history (up to {HISTORY_LIMIT})
        </div>
        <RunHistory key={job.id} jobId={job.id} />
      </div>
    </div>
  )
}

export function JobsScreen() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingJob, setEditingJob] = useState<ClaudeJob | null>(null)

  const jobsQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchJobs,
    refetchInterval: 30_000,
  })
  const profilesQuery = useQuery({
    queryKey: PROFILES_QUERY_KEY,
    queryFn: fetchJobProfiles,
    staleTime: 60_000,
  })
  const profiles = useMemo(
    () =>
      profilesQuery.data?.length
        ? profilesQuery.data
        : [{ name: 'default', active: true }],
    [profilesQuery.data],
  )

  const pauseMutation = useMutation({
    mutationFn: pauseJob,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast('Job paused')
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to pause job', { type: 'error' })
    },
  })
  const resumeMutation = useMutation({
    mutationFn: resumeJob,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast('Job resumed')
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to resume job', { type: 'error' })
    },
  })
  const triggerMutation = useMutation({
    mutationFn: triggerJob,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast('Job triggered')
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to trigger job', { type: 'error' })
    },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteJob,
    onSuccess: (_data, deletedId) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast('Job deleted')
      setSelectedJobId((current) => (current === deletedId ? null : current))
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to delete job', { type: 'error' })
    },
  })
  const createMutation = useMutation({
    mutationFn: createJob,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast('Job created')
      setShowCreate(false)
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to create job', {
        type: 'error',
      })
    },
  })
  const updateMutation = useMutation({
    mutationFn: async (payload: {
      jobId: string
      updates: {
        profile: string
        name: string
        schedule: string
        prompt: string
        deliver?: Array<string>
        skills?: Array<string>
        repeat?: number
      }
    }) => updateJob(payload.jobId, payload.updates),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
      toast('Job updated')
      setEditingJob(null)
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to update job', {
        type: 'error',
      })
    },
  })

  const allJobs = jobsQuery.data ?? []

  const filteredJobs = useMemo(() => {
    if (!search.trim()) return allJobs
    const q = search.toLowerCase()
    return allJobs.filter(
      (j) =>
        j.name.toLowerCase().includes(q) ||
        j.prompt.toLowerCase().includes(q) ||
        j.profile?.toLowerCase().includes(q),
    )
  }, [allJobs, search])

  const activeJobs = useMemo(
    () => filteredJobs.filter(isJobActive),
    [filteredJobs],
  )
  const pausedJobs = useMemo(
    () => filteredJobs.filter((j) => !isJobActive(j)),
    [filteredJobs],
  )

  const selectedJob = useMemo(
    () => allJobs.find((j) => j.id === selectedJobId) ?? null,
    [allJobs, selectedJobId],
  )

  const handleCreate = useCallback(
    async (input: {
      profile: string
      name: string
      schedule: string
      prompt: string
      deliver?: Array<string>
      skills?: Array<string>
      repeat?: number
    }) => {
      await createMutation.mutateAsync(input)
    },
    [createMutation],
  )

  const handleDelete = useCallback(
    (id: string) => {
      const job = allJobs.find((j) => j.id === id)
      if (!job) return
      if (!confirm(`Delete job "${job.name}"?`)) return
      deleteMutation.mutate(id)
    },
    [allJobs, deleteMutation],
  )

  const handleSelect = useCallback((id: string) => {
    setSelectedJobId((current) => (current === id ? null : id))
  }, [])

  return (
    <div
      className="h-full flex flex-col bg-surface text-ink overflow-hidden"
      data-testid="jobs-screen"
    >
      {/* Top header bar */}
      <header
        className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-primary-200 bg-primary-50/85 backdrop-blur-xl shrink-0"
        data-testid="jobs-header"
      >
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={Clock01Icon}
            size={16}
            className="text-[var(--theme-accent)]"
          />
          <h1 className="text-sm font-semibold text-[var(--theme-text)]">
            Scheduled Jobs
          </h1>
          {jobsQuery.data && (
            <span
              className="text-xs text-[var(--theme-muted)]"
              data-testid="jobs-count"
            >
              ({activeJobs.length} active, {pausedJobs.length} paused)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              void queryClient.invalidateQueries({ queryKey: QUERY_KEY })
            }
            className="rounded-lg p-1.5 transition-colors hover:bg-[var(--theme-hover)]"
            title="Refresh"
            data-testid="refresh-button"
          >
            <HugeiconsIcon
              icon={RefreshIcon}
              size={14}
              className="text-[var(--theme-muted)]"
            />
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--theme-accent)' }}
            data-testid="new-job-button"
          >
            <HugeiconsIcon icon={Add01Icon} size={12} />
            New Job
          </button>
        </div>
      </header>

      {/* Split pane body */}
      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        {/* Left: dense selector pane */}
        <div
          className="flex max-h-[45%] w-full shrink-0 flex-col overflow-hidden border-b border-[var(--theme-border)] md:max-h-none md:w-72 md:border-b-0 md:border-r"
          data-testid="jobs-selector"
        >
          {/* Search bar */}
          <div className="px-3 py-2 border-b border-[var(--theme-border)] shrink-0">
            <div className="relative">
              <HugeiconsIcon
                icon={Search01Icon}
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--theme-muted)]"
              />
              <input
                type="text"
                placeholder="Search jobs…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-[var(--theme-border)] bg-[var(--theme-input)] py-1 pl-6 pr-2 text-xs text-[var(--theme-text)] placeholder:text-[var(--theme-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent)]"
                data-testid="search-input"
              />
            </div>
            {profilesQuery.isError && (
              <p
                className="mt-1.5 text-[10px]"
                style={{ color: 'var(--theme-warning)' }}
              >
                Profile list unavailable.
              </p>
            )}
          </div>

          {/* Job list */}
          <div className="flex-1 overflow-y-auto" data-testid="job-list">
            {jobsQuery.isLoading && (
              <div
                className="flex items-center justify-center py-8 text-xs text-[var(--theme-muted)]"
                data-testid="jobs-loading"
              >
                Loading jobs…
              </div>
            )}
            {jobsQuery.isError && (
              <div
                className="px-3 py-4 text-xs"
                style={{ color: 'var(--theme-danger)' }}
                data-testid="jobs-error"
              >
                Failed to load jobs:{' '}
                {jobsQuery.error instanceof Error
                  ? jobsQuery.error.message
                  : 'Unknown error'}
              </div>
            )}
            {!jobsQuery.isLoading &&
              !jobsQuery.isError &&
              filteredJobs.length === 0 && (
                <div
                  className="flex flex-col items-center justify-center py-8 text-[var(--theme-muted)]"
                  data-testid="jobs-empty"
                >
                  <HugeiconsIcon
                    icon={Clock01Icon}
                    size={24}
                    className="mb-2 opacity-40"
                  />
                  <p className="text-xs">No jobs found</p>
                </div>
              )}
            {!jobsQuery.isLoading &&
              !jobsQuery.isError &&
              activeJobs.length > 0 && (
                <div data-testid="active-group">
                  <div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--theme-muted)] bg-[var(--theme-bg)] border-b border-[var(--theme-border)] sticky top-0 z-10">
                    Active · {activeJobs.length}
                  </div>
                  {activeJobs.map((job) => (
                    <JobListRow
                      key={job.id}
                      job={job}
                      isSelected={selectedJobId === job.id}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              )}
            {!jobsQuery.isLoading &&
              !jobsQuery.isError &&
              pausedJobs.length > 0 && (
                <div data-testid="paused-group">
                  <div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--theme-muted)] bg-[var(--theme-bg)] border-b border-[var(--theme-border)] sticky top-0 z-10">
                    Paused · {pausedJobs.length}
                  </div>
                  {pausedJobs.map((job) => (
                    <JobListRow
                      key={job.id}
                      job={job}
                      isSelected={selectedJobId === job.id}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              )}
          </div>
        </div>

        {/* Right: detail pane */}
        <div
          className="flex-1 overflow-y-auto min-w-0"
          data-testid="detail-pane"
        >
          {selectedJob ? (
            <JobDetailPane
              key={selectedJob.id}
              job={selectedJob}
              onPause={(id) => pauseMutation.mutate(id)}
              onResume={(id) => resumeMutation.mutate(id)}
              onTrigger={(id) => triggerMutation.mutate(id)}
              onEdit={(j) => setEditingJob(j)}
              onDelete={handleDelete}
              triggerPending={triggerMutation.isPending}
            />
          ) : (
            <div
              className="flex h-full items-center justify-center text-xs text-[var(--theme-muted)]"
              data-testid="detail-empty-state"
            >
              Select a job to view details
            </div>
          )}
        </div>
      </div>

      <CreateJobDialog
        open={showCreate}
        profiles={profiles}
        onOpenChange={setShowCreate}
        onSubmit={handleCreate}
        isSubmitting={createMutation.isPending}
      />
      <EditJobDialog
        job={editingJob}
        open={editingJob !== null}
        profiles={profiles}
        onOpenChange={(open) => {
          if (!open) setEditingJob(null)
        }}
        onSubmit={async (updates) => {
          if (!editingJob) return
          await updateMutation.mutateAsync({
            jobId: editingJob.id,
            updates,
          })
        }}
        isSubmitting={updateMutation.isPending}
      />
    </div>
  )
}
