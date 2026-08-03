/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { JobsScreen, RunHistory, isJobActive, HISTORY_LIMIT } from './jobs-screen'
import type { ClaudeJob, JobOutput } from '@/lib/jobs-api'

// --- mocks ---

vi.mock('@/lib/jobs-api', () => ({
  fetchJobs: vi.fn(),
  fetchJobOutput: vi.fn(),
  fetchJobProfiles: vi.fn(),
  pauseJob: vi.fn(),
  resumeJob: vi.fn(),
  triggerJob: vi.fn(),
  deleteJob: vi.fn(),
  createJob: vi.fn(),
  updateJob: vi.fn(),
}))

vi.mock('@/components/ui/toast', () => ({
  toast: vi.fn(),
}))

// Stub dialog components so they don't pollute snapshot/render
vi.mock('./create-job-dialog', () => ({
  CreateJobDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-dialog" /> : null,
}))
vi.mock('./edit-job-dialog', () => ({
  EditJobDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="edit-dialog" /> : null,
}))

import {
  fetchJobs,
  fetchJobOutput,
  fetchJobProfiles,
  pauseJob,
  resumeJob,
  triggerJob,
} from '@/lib/jobs-api'

afterEach(cleanup)

// --- fixtures ---

const activeJob: ClaudeJob = {
  id: 'job-active-1',
  name: 'Daily summary',
  prompt: 'Summarize the day',
  schedule: {},
  schedule_display: 'every 1h',
  enabled: true,
  state: 'scheduled',
  next_run_at: new Date(Date.now() + 3_600_000).toISOString(),
  last_run_at: new Date(Date.now() - 3_600_000).toISOString(),
  last_run_success: true,
  profile: 'default',
  deliver: ['local'],
  skills: ['summarize'],
}

const pausedJob: ClaudeJob = {
  id: 'job-paused-1',
  name: 'Weekly report',
  prompt: 'Generate weekly report',
  schedule: {},
  schedule_display: '0 9 * * 1',
  enabled: false,
  state: 'paused',
  next_run_at: null,
  last_run_at: null,
  last_run_success: null,
  profile: 'reporting',
}

const sampleOutputs: Array<JobOutput> = [
  {
    filename: 'run1.log',
    timestamp: '2026-04-30T12:00:00Z',
    content: 'First run output content',
    size: 24,
  },
  {
    filename: 'run2.log',
    timestamp: '2026-04-30T13:00:00Z',
    content: 'Second run output content',
    size: 26,
  },
]

// --- helpers ---

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderScreen() {
  const client = makeQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <JobsScreen />
    </QueryClientProvider>,
  )
}

function renderRunHistory(jobId: string) {
  const client = makeQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <RunHistory jobId={jobId} />
    </QueryClientProvider>,
  )
}

// --- tests ---

describe('isJobActive', () => {
  it('returns true for enabled non-paused/non-completed jobs', () => {
    expect(isJobActive(activeJob)).toBe(true)
  })
  it('returns false for disabled jobs', () => {
    expect(isJobActive({ ...activeJob, enabled: false })).toBe(false)
  })
  it('returns false for paused state', () => {
    expect(isJobActive({ ...activeJob, state: 'paused' })).toBe(false)
  })
  it('returns false for completed state', () => {
    expect(isJobActive({ ...activeJob, state: 'completed' })).toBe(false)
  })
})

describe('HISTORY_LIMIT', () => {
  it('is 50', () => {
    expect(HISTORY_LIMIT).toBe(50)
  })
})

describe('JobsScreen - loading state', () => {
  beforeEach(() => {
    ;(fetchJobs as Mock).mockReturnValue(new Promise(() => {}))
    ;(fetchJobProfiles as Mock).mockResolvedValue([])
  })

  it('shows loading indicator while jobs are fetching', async () => {
    renderScreen()
    expect(await screen.findByTestId('jobs-loading')).toBeTruthy()
  })
})

describe('JobsScreen - error state', () => {
  beforeEach(() => {
    ;(fetchJobs as Mock).mockRejectedValue(new Error('gateway down'))
    ;(fetchJobProfiles as Mock).mockResolvedValue([])
  })

  it('shows error message when jobs fetch fails', async () => {
    renderScreen()
    const err = await screen.findByTestId('jobs-error')
    expect(err.textContent).toContain('gateway down')
  })
})

describe('JobsScreen - empty state', () => {
  beforeEach(() => {
    ;(fetchJobs as Mock).mockResolvedValue([])
    ;(fetchJobProfiles as Mock).mockResolvedValue([])
  })

  it('shows empty state when no jobs exist', async () => {
    renderScreen()
    expect(await screen.findByTestId('jobs-empty')).toBeTruthy()
  })

  it('shows empty detail state when nothing selected', async () => {
    renderScreen()
    expect(await screen.findByTestId('detail-empty-state')).toBeTruthy()
  })
})

describe('JobsScreen - active/paused grouping', () => {
  beforeEach(() => {
    ;(fetchJobs as Mock).mockResolvedValue([activeJob, pausedJob])
    ;(fetchJobProfiles as Mock).mockResolvedValue([])
    ;(fetchJobOutput as Mock).mockResolvedValue([])
  })

  it('renders an Active group and a Paused group', async () => {
    renderScreen()
    expect(await screen.findByTestId('active-group')).toBeTruthy()
    expect(await screen.findByTestId('paused-group')).toBeTruthy()
  })

  it('places active job in Active group and paused job in Paused group', async () => {
    renderScreen()
    const activeGroup = await screen.findByTestId('active-group')
    const pausedGroup = await screen.findByTestId('paused-group')
    expect(activeGroup.textContent).toContain('Daily summary')
    expect(pausedGroup.textContent).toContain('Weekly report')
    expect(activeGroup.textContent).not.toContain('Weekly report')
  })

  it('shows active/paused counts in the header after load', async () => {
    renderScreen()
    const counter = await screen.findByTestId('jobs-count')
    expect(counter.textContent).toContain('1 active')
    expect(counter.textContent).toContain('1 paused')
  })
})

describe('JobsScreen - selection', () => {
  beforeEach(() => {
    ;(fetchJobs as Mock).mockResolvedValue([activeJob, pausedJob])
    ;(fetchJobProfiles as Mock).mockResolvedValue([])
    ;(fetchJobOutput as Mock).mockResolvedValue([])
  })

  it('shows detail pane empty state before any selection', async () => {
    renderScreen()
    await screen.findByTestId('active-group')
    expect(screen.getByTestId('detail-empty-state')).toBeTruthy()
  })

  it('clicking a job row shows its detail pane', async () => {
    renderScreen()
    const row = await screen.findByTestId(`job-row-${activeJob.id}`)
    fireEvent.click(row)
    expect(await screen.findByTestId('job-detail-pane')).toBeTruthy()
    expect(screen.getByTestId('job-detail-pane').textContent).toContain(
      'Daily summary',
    )
  })

  it('clicking a different job updates the detail pane', async () => {
    renderScreen()
    const activeRow = await screen.findByTestId(`job-row-${activeJob.id}`)
    fireEvent.click(activeRow)
    await screen.findByTestId('job-detail-pane')

    const pausedRow = screen.getByTestId(`job-row-${pausedJob.id}`)
    fireEvent.click(pausedRow)
    await waitFor(() => {
      expect(screen.getByTestId('job-detail-pane').textContent).toContain(
        'Weekly report',
      )
    })
  })

  it('clicking the same row again deselects the job', async () => {
    renderScreen()
    const row = await screen.findByTestId(`job-row-${activeJob.id}`)
    fireEvent.click(row)
    await screen.findByTestId('job-detail-pane')
    fireEvent.click(row)
    await waitFor(() => {
      expect(screen.queryByTestId('job-detail-pane')).toBeNull()
      expect(screen.getByTestId('detail-empty-state')).toBeTruthy()
    })
  })

  it('selected row has aria-selected=true', async () => {
    renderScreen()
    const row = await screen.findByTestId(`job-row-${activeJob.id}`)
    fireEvent.click(row)
    await screen.findByTestId('job-detail-pane')
    expect(row.getAttribute('aria-selected')).toBe('true')
  })
})

describe('JobsScreen - detail pane metadata', () => {
  beforeEach(() => {
    ;(fetchJobs as Mock).mockResolvedValue([activeJob])
    ;(fetchJobProfiles as Mock).mockResolvedValue([])
    ;(fetchJobOutput as Mock).mockResolvedValue([])
  })

  it('shows schedule, profile, delivery, and skills when available', async () => {
    renderScreen()
    const row = await screen.findByTestId(`job-row-${activeJob.id}`)
    fireEvent.click(row)
    const metadata = await screen.findByTestId('detail-metadata')
    expect(metadata.textContent).toContain('every 1h')
    expect(metadata.textContent).toContain('default')
    expect(metadata.textContent).toContain('local')
    expect(metadata.textContent).toContain('summarize')
  })

  it('shows prompt in detail pane', async () => {
    renderScreen()
    const row = await screen.findByTestId(`job-row-${activeJob.id}`)
    fireEvent.click(row)
    const promptSection = await screen.findByTestId('detail-prompt')
    expect(promptSection.textContent).toContain('Summarize the day')
  })

  it('shows Unavailable for mode when not in API response', async () => {
    renderScreen()
    const row = await screen.findByTestId(`job-row-${activeJob.id}`)
    fireEvent.click(row)
    await screen.findByTestId('detail-metadata')
    expect(
      screen.getByTestId('field-unavailable-mode').textContent,
    ).toContain('Unavailable')
  })

  it('shows Unavailable for delivery when deliver is empty', async () => {
    ;(fetchJobs as Mock).mockResolvedValue([
      { ...activeJob, deliver: undefined },
    ])
    renderScreen()
    const row = await screen.findByTestId(`job-row-${activeJob.id}`)
    fireEvent.click(row)
    await screen.findByTestId('detail-metadata')
    expect(
      screen.getByTestId('field-unavailable-delivery').textContent,
    ).toContain('Unavailable')
  })
})

describe('JobsScreen - search filter', () => {
  beforeEach(() => {
    ;(fetchJobs as Mock).mockResolvedValue([activeJob, pausedJob])
    ;(fetchJobProfiles as Mock).mockResolvedValue([])
    ;(fetchJobOutput as Mock).mockResolvedValue([])
  })

  it('filters the list by name', async () => {
    renderScreen()
    await screen.findByTestId('active-group')
    const searchInput = screen.getByTestId('search-input')
    fireEvent.change(searchInput, { target: { value: 'daily' } })
    await waitFor(() => {
      expect(screen.queryByTestId('active-group')?.textContent).toContain(
        'Daily summary',
      )
      expect(screen.queryByTestId('paused-group')).toBeNull()
    })
  })

  it('shows empty state when search matches nothing', async () => {
    renderScreen()
    await screen.findByTestId('active-group')
    const searchInput = screen.getByTestId('search-input')
    fireEvent.change(searchInput, { target: { value: 'zzznomatch' } })
    await waitFor(() => {
      expect(screen.getByTestId('jobs-empty')).toBeTruthy()
    })
  })
})

describe('JobsScreen - action isolation', () => {
  beforeEach(() => {
    ;(fetchJobs as Mock).mockResolvedValue([activeJob, pausedJob])
    ;(fetchJobProfiles as Mock).mockResolvedValue([])
    ;(fetchJobOutput as Mock).mockResolvedValue([])
    ;(pauseJob as Mock).mockResolvedValue({ ...activeJob, state: 'paused' })
    ;(resumeJob as Mock).mockResolvedValue({ ...pausedJob, enabled: true, state: 'scheduled' })
    ;(triggerJob as Mock).mockResolvedValue(activeJob)
  })

  it('clicking pause action does not deselect or change the selected job row', async () => {
    renderScreen()
    const activeRow = await screen.findByTestId(`job-row-${activeJob.id}`)
    fireEvent.click(activeRow)
    await screen.findByTestId('job-detail-pane')

    // verify selection before action
    expect(activeRow.getAttribute('aria-selected')).toBe('true')

    const pauseBtn = screen.getByTestId('action-pause-resume')
    fireEvent.click(pauseBtn)

    // detail pane still shows the same job and row is still selected
    await waitFor(() => {
      expect(screen.getByTestId('job-detail-pane').textContent).toContain(
        'Daily summary',
      )
    })
    expect(activeRow.getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByTestId('detail-empty-state')).toBeNull()
  })

  it('clicking run-now action does not deselect or change the selected job row', async () => {
    renderScreen()
    const activeRow = await screen.findByTestId(`job-row-${activeJob.id}`)
    fireEvent.click(activeRow)
    await screen.findByTestId('job-detail-pane')

    expect(activeRow.getAttribute('aria-selected')).toBe('true')

    fireEvent.click(screen.getByTestId('action-run'))

    // selection should remain unchanged - pane stays and row stays selected
    await waitFor(() => {
      expect(screen.getByTestId('job-detail-pane').textContent).toContain(
        'Daily summary',
      )
    })
    expect(activeRow.getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByTestId('detail-empty-state')).toBeNull()
  })
})

describe('RunHistory - states', () => {
  it('shows loading state while fetching', async () => {
    ;(fetchJobOutput as Mock).mockReturnValue(new Promise(() => {}))
    renderRunHistory('job-1')
    expect(await screen.findByTestId('history-loading')).toBeTruthy()
  })

  it('shows error state when fetch fails', async () => {
    ;(fetchJobOutput as Mock).mockRejectedValue(
      new Error('output endpoint unavailable'),
    )
    renderRunHistory('job-1')
    const err = await screen.findByTestId('history-error')
    expect(err.textContent).toContain('output endpoint unavailable')
  })

  it('shows empty state when no outputs exist', async () => {
    ;(fetchJobOutput as Mock).mockResolvedValue([])
    renderRunHistory('job-1')
    expect(await screen.findByTestId('history-empty')).toBeTruthy()
  })

  it('renders a row per output with timestamp and size', async () => {
    ;(fetchJobOutput as Mock).mockResolvedValue(sampleOutputs)
    renderRunHistory('job-1')
    const list = await screen.findByTestId('history-list')
    expect(list.textContent).toContain('24 B')
    expect(list.textContent).toContain('26 B')
  })

  it('expands a run row on click and shows content', async () => {
    ;(fetchJobOutput as Mock).mockResolvedValue(sampleOutputs)
    renderRunHistory('job-1')
    await screen.findByTestId('history-list')

    const firstRow = screen.getByTestId(
      `run-row-${sampleOutputs[0].filename}-${sampleOutputs[0].timestamp}`,
    )
    const toggleBtn = firstRow.querySelector('button') as HTMLButtonElement
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggleBtn)

    await waitFor(() => {
      expect(toggleBtn.getAttribute('aria-expanded')).toBe('true')
    })
    const expanded = screen.getByTestId(
      `run-expanded-${sampleOutputs[0].filename}-${sampleOutputs[0].timestamp}`,
    )
    expect(expanded.textContent).toContain('First run output content')
  })

  it('collapsing one run does not expand another', async () => {
    ;(fetchJobOutput as Mock).mockResolvedValue(sampleOutputs)
    renderRunHistory('job-1')
    await screen.findByTestId('history-list')

    const firstRunKey = `${sampleOutputs[0].filename}-${sampleOutputs[0].timestamp}`
    const secondRunKey = `${sampleOutputs[1].filename}-${sampleOutputs[1].timestamp}`

    const firstRow = screen.getByTestId(`run-row-${firstRunKey}`)
    fireEvent.click(firstRow.querySelector('button') as HTMLButtonElement)

    await waitFor(() => {
      expect(
        screen.queryByTestId(`run-expanded-${secondRunKey}`),
      ).toBeNull()
    })
  })

  it('calls fetchJobOutput with HISTORY_LIMIT=50', async () => {
    ;(fetchJobOutput as Mock).mockResolvedValue([])
    renderRunHistory('job-xyz')
    await screen.findByTestId('history-empty')
    expect(fetchJobOutput).toHaveBeenCalledWith('job-xyz', HISTORY_LIMIT)
  })
})
