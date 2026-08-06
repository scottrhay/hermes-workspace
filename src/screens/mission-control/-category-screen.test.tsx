// @vitest-environment jsdom
import React from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const reactActGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean
}
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before any component imports
// ---------------------------------------------------------------------------

// Mock Link so it renders as a plain <a> without needing a router context
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children?: React.ReactNode
    to?: string
    params?: Record<string, string>
    [k: string]: unknown
  }) => {
    const href = params
      ? Object.entries(params).reduce(
          (acc, [k, v]) => acc.replace(`$${k}`, v),
          to ?? '',
        )
      : (to ?? '')
    return React.createElement('a', { href, ...rest }, children)
  },
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, useQuery: vi.fn() }
})

vi.mock('@/lib/mission-categories', () => ({
  isMarketing: vi.fn(),
  isTraining: vi.fn(),
}))

// Import after mocks are set up
import { useQuery } from '@tanstack/react-query'
import { isMarketing, isTraining } from '@/lib/mission-categories'
import { CategoryScreen } from './category-screen'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseQueryResult = {
  isPending: boolean
  isError: boolean
  isSuccess: boolean
  data?: { workstreams?: Workstream[] }
}

type Workstream = {
  sessionId: string
  sessionKey: string
  groupName: string
  chatId: string
  topicId: string
  title: string
  updatedAt: number
  messageCount: number
  isActive: boolean
  preview: string
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MARKETING_WS: Workstream = {
  sessionId: 'sess-mkt-1',
  sessionKey: 'mkt-key-1',
  groupName: 'Marketing Team',
  chatId: '100',
  topicId: '10',
  title: 'Q3 Campaign Launch',
  updatedAt: Date.now() - 2 * 60 * 60 * 1000, // 2h ago
  messageCount: 42,
  isActive: true,
  preview: "Let's run the ad campaign next week.",
}

const TRAINING_WS: Workstream = {
  sessionId: 'sess-trn-1',
  sessionKey: 'trn-key-1',
  groupName: 'Training Department',
  chatId: '200',
  topicId: '20',
  title: 'React Course Module 3',
  updatedAt: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3d ago
  messageCount: 17,
  isActive: false,
  preview: 'Today we cover hooks in depth.',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockedUseQuery = useQuery as ReturnType<typeof vi.fn>
const mockedIsMarketing = isMarketing as ReturnType<typeof vi.fn>
const mockedIsTraining = isTraining as ReturnType<typeof vi.fn>

function mockQuery(result: UseQueryResult) {
  mockedUseQuery.mockReturnValue(result)
}

async function renderScreen(element: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await React.act(async () => {
    root.render(element)
  })
  return {
    container,
    unmount: async () => {
      await React.act(async () => {
        root.unmount()
      })
      document.body.removeChild(container)
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CategoryScreen — loading state', () => {
  it('shows loading indicator while query is pending', async () => {
    mockQuery({ isPending: true, isError: false, isSuccess: false })

    const { container, unmount } = await renderScreen(
      React.createElement(CategoryScreen, {
        category: 'marketing',
        title: 'Marketing Ideas',
        description: 'Telegram workstreams tagged as marketing',
      }),
    )

    expect(container.querySelector('[data-testid="category-loading"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="category-error"]')).toBeNull()
    expect(container.querySelector('[data-testid="category-populated"]')).toBeNull()
    expect(container.querySelector('[data-testid="category-empty"]')).toBeNull()

    await unmount()
  })
})

describe('CategoryScreen — error state', () => {
  it('shows error message when query fails', async () => {
    mockQuery({ isPending: false, isError: true, isSuccess: false })

    const { container, unmount } = await renderScreen(
      React.createElement(CategoryScreen, {
        category: 'marketing',
        title: 'Marketing Ideas',
        description: 'Telegram workstreams tagged as marketing',
      }),
    )

    const errorEl = container.querySelector('[data-testid="category-error"]')
    expect(errorEl).not.toBeNull()
    expect(errorEl?.textContent).toContain('Could not load Telegram workstreams')
    expect(errorEl?.textContent).toContain('gateway is running')
    expect(container.querySelector('[data-testid="category-loading"]')).toBeNull()

    await unmount()
  })
})

describe('CategoryScreen — empty state', () => {
  it('shows empty state when query succeeds but no items match the category', async () => {
    mockQuery({
      isPending: false,
      isError: false,
      isSuccess: true,
      data: { workstreams: [MARKETING_WS] },
    })
    // No items match marketing filter
    mockedIsMarketing.mockReturnValue(false)

    const { container, unmount } = await renderScreen(
      React.createElement(CategoryScreen, {
        category: 'marketing',
        title: 'Marketing Ideas',
        description: 'Telegram workstreams tagged as marketing',
      }),
    )

    const emptyEl = container.querySelector('[data-testid="category-empty"]')
    expect(emptyEl).not.toBeNull()
    expect(emptyEl?.textContent).toContain('No Marketing workstreams found')
    expect(emptyEl?.textContent).toContain('mission-categories.ts')
    expect(container.querySelector('[data-testid="category-populated"]')).toBeNull()

    await unmount()
  })

  it('shows training label in empty state for training category', async () => {
    mockQuery({
      isPending: false,
      isError: false,
      isSuccess: true,
      data: { workstreams: [] },
    })
    mockedIsTraining.mockReturnValue(false)

    const { container, unmount } = await renderScreen(
      React.createElement(CategoryScreen, {
        category: 'training',
        title: 'Training Courses',
        description: 'Telegram workstreams tagged as training',
      }),
    )

    const emptyEl = container.querySelector('[data-testid="category-empty"]')
    expect(emptyEl?.textContent).toContain('No Training workstreams found')

    await unmount()
  })
})

describe('CategoryScreen — populated state', () => {
  it('shows populated state with filtered workstream items when items match', async () => {
    mockQuery({
      isPending: false,
      isError: false,
      isSuccess: true,
      data: { workstreams: [MARKETING_WS] },
    })
    mockedIsMarketing.mockReturnValue(true)

    const { container, unmount } = await renderScreen(
      React.createElement(CategoryScreen, {
        category: 'marketing',
        title: 'Marketing Ideas',
        description: 'Telegram workstreams tagged as marketing',
      }),
    )

    expect(container.querySelector('[data-testid="category-populated"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="category-empty"]')).toBeNull()
    expect(container.querySelector('[data-testid="category-loading"]')).toBeNull()

    await unmount()
  })

  it('shows title, groupName, and preview for each matching workstream', async () => {
    mockQuery({
      isPending: false,
      isError: false,
      isSuccess: true,
      data: { workstreams: [MARKETING_WS] },
    })
    mockedIsMarketing.mockReturnValue(true)

    const { container, unmount } = await renderScreen(
      React.createElement(CategoryScreen, {
        category: 'marketing',
        title: 'Marketing Ideas',
        description: 'Telegram workstreams tagged as marketing',
      }),
    )

    expect(container.textContent).toContain(MARKETING_WS.title)
    expect(container.textContent).toContain(MARKETING_WS.groupName)
    expect(container.textContent).toContain(MARKETING_WS.preview)

    await unmount()
  })
})

describe('CategoryScreen — category filtering', () => {
  it('marketing category calls isMarketing and not isTraining', async () => {
    mockQuery({
      isPending: false,
      isError: false,
      isSuccess: true,
      data: { workstreams: [MARKETING_WS, TRAINING_WS] },
    })
    // Marketing items match, training-only items do not
    mockedIsMarketing.mockImplementation(
      (ws: { title: string }) => ws.title === MARKETING_WS.title,
    )

    const { container, unmount } = await renderScreen(
      React.createElement(CategoryScreen, {
        category: 'marketing',
        title: 'Marketing Ideas',
        description: 'Telegram workstreams tagged as marketing',
      }),
    )

    expect(mockedIsMarketing).toHaveBeenCalled()
    expect(mockedIsTraining).not.toHaveBeenCalled()
    expect(container.textContent).toContain(MARKETING_WS.title)
    expect(container.textContent).not.toContain(TRAINING_WS.title)

    await unmount()
  })

  it('training category calls isTraining and not isMarketing', async () => {
    mockQuery({
      isPending: false,
      isError: false,
      isSuccess: true,
      data: { workstreams: [MARKETING_WS, TRAINING_WS] },
    })
    // Training items match, marketing-only items do not
    mockedIsTraining.mockImplementation(
      (ws: { title: string }) => ws.title === TRAINING_WS.title,
    )

    const { container, unmount } = await renderScreen(
      React.createElement(CategoryScreen, {
        category: 'training',
        title: 'Training Courses',
        description: 'Telegram workstreams tagged as training',
      }),
    )

    expect(mockedIsTraining).toHaveBeenCalled()
    expect(mockedIsMarketing).not.toHaveBeenCalled()
    expect(container.textContent).toContain(TRAINING_WS.title)
    expect(container.textContent).not.toContain(MARKETING_WS.title)

    await unmount()
  })
})

describe('CategoryScreen — root element', () => {
  it('renders the category-screen root data-testid', async () => {
    mockQuery({ isPending: true, isError: false, isSuccess: false })

    const { container, unmount } = await renderScreen(
      React.createElement(CategoryScreen, {
        category: 'marketing',
        title: 'Marketing Ideas',
        description: 'Telegram workstreams tagged as marketing',
      }),
    )

    expect(container.querySelector('[data-testid="category-screen"]')).not.toBeNull()

    await unmount()
  })
})

