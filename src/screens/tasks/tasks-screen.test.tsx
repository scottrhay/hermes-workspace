/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { OPENENGINE_DASHBOARD_URL, TasksScreen } from './tasks-screen'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
}

function renderTasks() {
  const client = makeQueryClient()
  const result = render(
    <QueryClientProvider client={client}>
      <TasksScreen />
    </QueryClientProvider>,
  )
  return { ...result, client }
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_ITEMS = [
  {
    id: 'item-a',
    title: 'First feature',
    status: 'in_progress',
    priority: 'P0',
    owner: 'default',
    type: 'feature',
    tier: 'full_spec',
    summary: 'A summary',
    workflowMode: 'governed',
    createdBy: 'default',
    requiresDeployment: true,
    requiresOpenBrainLog: false,
    forge: { red: 2, yellow: 0, green: 0, notApplicable: 0 },
    updatedAt: '2026-08-03T10:00:00Z',
    latestReceipt: null,
  },
  {
    id: 'item-b',
    title: 'Blocked task',
    status: 'blocked',
    priority: 'P1',
    owner: 'ariel',
    type: 'task',
    tier: null,
    summary: null,
    workflowMode: 'simple',
    createdBy: 'ariel',
    requiresDeployment: false,
    requiresOpenBrainLog: false,
    forge: { red: 0, yellow: 0, green: 0, notApplicable: 0 },
    updatedAt: '2026-08-02T08:00:00Z',
    latestReceipt: {
      id: 'r1',
      receiptType: 'AGENT PROGRESS',
      actor: 'ariel',
      summary: 'Still blocked',
      createdAt: '2026-08-02T08:00:00Z',
    },
  },
  {
    id: 'item-c',
    title: 'Closed issue',
    status: 'closed',
    priority: 'P2',
    owner: 'default',
    type: 'bug',
    tier: null,
    summary: null,
    workflowMode: 'simple',
    createdBy: 'default',
    requiresDeployment: false,
    requiresOpenBrainLog: false,
    forge: { red: 0, yellow: 0, green: 0, notApplicable: 0 },
    updatedAt: '2026-08-01T00:00:00Z',
    latestReceipt: null,
  },
]

const MOCK_DETAIL = {
  ...MOCK_ITEMS[0],
  createdAt: '2026-08-01T00:00:00Z',
  acceptanceCriteria: 'Meets all criteria',
  receipts: [
    {
      id: 'r2',
      receiptType: 'AGENT PROGRESS',
      actor: 'default',
      summary: 'Work started',
      createdAt: '2026-08-03T09:00:00Z',
    },
  ],
  forgeDimensions: [
    {
      dimension: 'requirements',
      status: 'red',
      applicable: true,
      owner: 'default',
      verifier: null,
      notes: '',
    },
    {
      dimension: 'design',
      status: 'red',
      applicable: true,
      owner: 'default',
      verifier: null,
      notes: '',
    },
  ],
}

function mockSuccessFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (url === '/api/openengine-work-items') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, items: MOCK_ITEMS }),
        })
      }
      if (url.startsWith('/api/openengine-work-items/')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, item: MOCK_DETAIL }),
        })
      }
      return Promise.resolve({ ok: false, status: 404 })
    }),
  )
}

beforeEach(() => {
  mockSuccessFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TasksScreen', () => {
  it('renders header with title', () => {
    renderTasks()
    expect(screen.getByRole('heading', { name: /tasks/i })).toBeTruthy()
  })

  it('renders canonical dashboard link in header', () => {
    renderTasks()
    const links = screen.getAllByRole('link')
    const dashLink = links.find(
      (l) => l.getAttribute('href') === OPENENGINE_DASHBOARD_URL,
    )
    expect(dashLink).toBeTruthy()
    expect(dashLink?.getAttribute('target')).toBe('_blank')
  })

  it('shows loading state initially', async () => {
    renderTasks()
    expect(screen.queryAllByTestId('board-loading').length).toBeGreaterThan(0)
  })

  it('renders kanban columns after load', async () => {
    renderTasks()
    expect(await screen.findByTestId('column-in_progress')).toBeTruthy()
    expect(screen.getByTestId('column-blocked')).toBeTruthy()
    expect(screen.getByTestId('column-closed')).toBeTruthy()
  })

  it('shows column counts', async () => {
    renderTasks()
    await screen.findByTestId('column-in_progress')
    // in_progress has 1 item
    const col = screen.getByTestId('column-in_progress')
    expect(col.textContent).toContain('1')
  })

  it('cards are rendered after load', async () => {
    renderTasks()
    await screen.findByTestId('column-in_progress')
    const cards = screen.getAllByTestId('oe-card')
    expect(cards.length).toBe(3)
  })

  it('cards show status, title, owner, priority, tier without expansion', async () => {
    renderTasks()
    await screen.findByTestId('column-in_progress')
    const cards = screen.getAllByTestId('oe-card')
    const firstCard = cards[0]
    expect(firstCard.textContent).toContain('First feature')
    expect(firstCard.textContent).toContain('In Progress')
    expect(firstCard.textContent).toContain('P0')
    expect(firstCard.textContent).toContain('default')
    expect(firstCard.textContent).toContain('full_spec')
  })

  it('opens detail panel on one-click card select', async () => {
    renderTasks()
    await screen.findByTestId('column-in_progress')
    const cards = screen.getAllByTestId('oe-card')
    fireEvent.click(cards[0])
    expect(screen.getByTestId('detail-panel')).toBeTruthy()
  })

  it('detail panel shows loading then item data', async () => {
    renderTasks()
    await screen.findByTestId('column-in_progress')
    const cards = screen.getAllByTestId('oe-card')
    fireEvent.click(cards[0])

    // Initially shows loading in panel
    expect(screen.getByTestId('detail-panel')).toBeTruthy()

    // Waits for detail data to appear
    await waitFor(() => {
      const panel = screen.getByTestId('detail-panel')
      expect(panel.textContent).toContain('First feature')
    })
    expect(screen.getByTestId('detail-panel').textContent).toContain('Work started')
  })

  it('detail panel shows acceptance criteria when present', async () => {
    renderTasks()
    await screen.findByTestId('column-in_progress')
    fireEvent.click(screen.getAllByTestId('oe-card')[0])

    await waitFor(() => {
      const panel = screen.getByTestId('detail-panel')
      expect(panel.textContent).toContain('Meets all criteria')
    })
  })

  it('detail panel has canonical dashboard link', async () => {
    renderTasks()
    await screen.findByTestId('column-in_progress')
    fireEvent.click(screen.getAllByTestId('oe-card')[0])
    await waitFor(() => {
      const panel = screen.getByTestId('detail-panel')
      expect(panel.textContent).toContain('Meets all criteria')
    })

    const panel = screen.getByTestId('detail-panel')
    const links = Array.from(panel.querySelectorAll('a'))
    expect(links.some((l) => l.getAttribute('href') === OPENENGINE_DASHBOARD_URL)).toBe(true)
  })

  it('closes detail panel with close button', async () => {
    renderTasks()
    await screen.findByTestId('column-in_progress')
    fireEvent.click(screen.getAllByTestId('oe-card')[0])
    expect(screen.getByTestId('detail-panel')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /close detail/i }))
    expect(screen.queryByTestId('detail-panel')).toBeNull()
  })

  it('shows error state and Retry button when fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ ok: false, error: 'OpenEngine unavailable' }),
      }),
    )

    renderTasks()
    const errDiv = await screen.findByTestId('board-error')
    expect(errDiv).toBeTruthy()
    expect(errDiv.textContent).toContain('unavailable')

    const retryBtn = Array.from(errDiv.querySelectorAll('button')).find((b) =>
      b.textContent?.toLowerCase().includes('retry'),
    )
    expect(retryBtn).toBeTruthy()

    // Canonical dashboard link in error state
    const links = Array.from(errDiv.querySelectorAll('a'))
    expect(links.some((l) => l.getAttribute('href') === OPENENGINE_DASHBOARD_URL)).toBe(true)
  })

  it('shows empty state when no items returned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, items: [] }),
      }),
    )

    renderTasks()
    expect(await screen.findByTestId('board-empty')).toBeTruthy()
  })

  it('filters by search term', async () => {
    renderTasks()
    await screen.findByTestId('column-in_progress')

    const searchInput = screen.getByRole('searchbox')
    fireEvent.change(searchInput, { target: { value: 'Blocked' } })

    await waitFor(() => {
      const cards = screen.getAllByTestId('oe-card')
      expect(cards.length).toBe(1)
      expect(cards[0].textContent).toContain('Blocked task')
    })
  })

  it('filters by owner', async () => {
    renderTasks()
    await screen.findByTestId('column-in_progress')

    const ownerSelect = screen.getByLabelText(/filter by owner/i)
    fireEvent.change(ownerSelect, { target: { value: 'ariel' } })

    await waitFor(() => {
      const cards = screen.getAllByTestId('oe-card')
      expect(cards.length).toBe(1)
      expect(cards[0].textContent).toContain('Blocked task')
    })
  })

  it('filters by status', async () => {
    renderTasks()
    await screen.findByTestId('column-in_progress')

    const statusSelect = screen.getByLabelText(/filter by status/i)
    fireEvent.change(statusSelect, { target: { value: 'closed' } })

    await waitFor(() => {
      const cards = screen.getAllByTestId('oe-card')
      expect(cards.length).toBe(1)
      expect(cards[0].textContent).toContain('Closed issue')
    })
  })

  it('shows filtered-empty state when no items match filter', async () => {
    renderTasks()
    await screen.findByTestId('column-in_progress')

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'xyznonexistent' },
    })

    expect(await screen.findByTestId('board-filtered-empty')).toBeTruthy()
  })

  it('shows clear button when filter active, clears on click', async () => {
    renderTasks()
    await screen.findByTestId('column-in_progress')

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Blocked' },
    })

    const clearBtn = await screen.findByRole('button', { name: /clear/i })
    expect(clearBtn).toBeTruthy()

    fireEvent.click(clearBtn)

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /clear/i })).toBeNull()
      expect(screen.getAllByTestId('oe-card').length).toBe(3)
    })
  })

  it('refresh button triggers re-fetch', async () => {
    const { client } = renderTasks()
    await screen.findByTestId('column-in_progress')

    const spy = vi.spyOn(client, 'invalidateQueries')
    const refreshBtn = screen.getByRole('button', { name: /refresh/i })
    fireEvent.click(refreshBtn)

    expect(spy).toHaveBeenCalled()
  })
})
