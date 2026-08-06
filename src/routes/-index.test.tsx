/** @vitest-environment jsdom */
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock @tanstack/react-router so Link renders as a plain <a> without needing a router context.
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (opts: unknown) => opts,
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string
    children: React.ReactNode
    [key: string]: unknown
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

// Mock the classifyWorkstream helper used by the route (not by home-screen directly).
vi.mock('@/lib/mission-categories', () => ({
  classifyWorkstream: () => ({ isMarketing: false, isTraining: false }),
}))

import {
  MissionControlHome,
  type HomeStatus,
} from '@/screens/mission-control/home-screen'

// Clean up the DOM between tests so screen queries never bleed across renders.
afterEach(() => {
  cleanup()
})

// A default status where everything is in the loading state (no data yet).
const loadingStatus: HomeStatus = {
  chats: { loading: true },
  openengine: { loading: true },
  marketing: { loading: true },
  training: { loading: true },
}

// A fully-resolved status with representative data.
const resolvedStatus: HomeStatus = {
  chats: { loading: false, count: 3 },
  openengine: { loading: false, reachable: true },
  marketing: { loading: false, count: 1 },
  training: { loading: false, count: 0 },
}

describe('MissionControlHome', () => {
  it('renders without crashing and does NOT redirect to /chat', () => {
    // If the component threw or called redirect() this render would fail.
    render(<MissionControlHome status={loadingStatus} />)
    // Verify the home container is present, proving we landed on the home screen.
    expect(screen.getByTestId('mission-control-home')).toBeTruthy()
  })

  it('renders exactly 5 primary cards with the correct data-testid attributes', () => {
    const { container } = render(<MissionControlHome status={resolvedStatus} />)

    const expectedIds = [
      'mc-card-chats',
      'mc-card-openengine-work',
      'mc-card-research-review',
      'mc-card-marketing-ideas',
      'mc-card-training-courses',
    ]

    for (const id of expectedIds) {
      const elements = container.querySelectorAll(`[data-testid="${id}"]`)
      expect(
        elements.length,
        `Expected exactly 1 element with data-testid="${id}"`,
      ).toBe(1)
    }
  })

  it('renders the secondary nav', () => {
    const { container } = render(<MissionControlHome status={loadingStatus} />)
    const navEls = container.querySelectorAll('[data-testid="secondary-nav"]')
    expect(navEls.length).toBe(1)
  })

  it('secondary nav contains links to swarm, memory, files, and settings', () => {
    const { container } = render(<MissionControlHome status={loadingStatus} />)
    const nav = container.querySelector('[data-testid="secondary-nav"]')
    expect(nav).not.toBeNull()

    const requiredHrefs = ['/swarm', '/memory', '/files', '/settings']
    for (const href of requiredHrefs) {
      const link = nav!.querySelector(`a[href="${href}"]`)
      expect(link, `Expected secondary nav to contain a link to ${href}`).not.toBeNull()
    }
  })

  it('shows loading state text on cards while data is pending (4 loading cards, research is static)', () => {
    const { container } = render(<MissionControlHome status={loadingStatus} />)
    const allEls = container.querySelectorAll('*')
    const loadingTexts = Array.from(allEls).filter(
      (el) => el.textContent === 'Loading…' && el.children.length === 0,
    )
    // 4 cards are loading (chats, openengine, marketing, training); research is always static.
    expect(loadingTexts.length).toBe(4)
  })

  it('shows resolved card status text once data arrives', () => {
    const { getByText } = render(<MissionControlHome status={resolvedStatus} />)
    expect(getByText('3 workstreams')).toBeTruthy()
    expect(getByText('OpenEngine online')).toBeTruthy()
    expect(getByText('1 workstream')).toBeTruthy()
    // 0 training workstreams → "0 workstreams"
    expect(getByText('0 workstreams')).toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // Five card labels and hrefs
  // -------------------------------------------------------------------------

  it('renders exactly 5 primary card labels with correct text', () => {
    const { container } = render(<MissionControlHome status={resolvedStatus} />)
    const expectedLabels = [
      'Chats',
      'OpenEngine Work',
      'Research Review',
      'Marketing Ideas',
      'Training Courses',
    ]
    for (const label of expectedLabels) {
      const els = Array.from(container.querySelectorAll('h2')).filter(
        (el) => el.textContent?.trim() === label,
      )
      expect(els.length, `Expected h2 with text "${label}"`).toBe(1)
    }
  })

  it('each primary card links to the correct route', () => {
    const { container } = render(<MissionControlHome status={resolvedStatus} />)
    const expectedLinks: Array<[string, string]> = [
      ['mc-card-chats', '/chat'],
      ['mc-card-openengine-work', '/tasks'],
      ['mc-card-research-review', '/research'],
      ['mc-card-marketing-ideas', '/marketing'],
      ['mc-card-training-courses', '/training'],
    ]
    for (const [testId, href] of expectedLinks) {
      const el = container.querySelector(`[data-testid="${testId}"]`)
      expect(el, `Card ${testId} should exist`).not.toBeNull()
      expect(
        el?.getAttribute('href'),
        `Card ${testId} should link to ${href}`,
      ).toBe(href)
    }
  })

  // -------------------------------------------------------------------------
  // Telegram degraded states
  // -------------------------------------------------------------------------

  it('chats card shows Unavailable when Telegram query errors', () => {
    const { container } = render(
      <MissionControlHome
        status={{ ...resolvedStatus, chats: { loading: false, error: true } }}
      />,
    )
    const card = container.querySelector('[data-testid="mc-card-chats"]')
    expect(card?.textContent).toContain('Unavailable')
  })

  it('marketing card shows Unavailable when Telegram query errors', () => {
    const { container } = render(
      <MissionControlHome
        status={{ ...resolvedStatus, marketing: { loading: false, error: true } }}
      />,
    )
    const card = container.querySelector('[data-testid="mc-card-marketing-ideas"]')
    expect(card?.textContent).toContain('Unavailable')
  })

  it('training card shows Unavailable when Telegram query errors', () => {
    const { container } = render(
      <MissionControlHome
        status={{ ...resolvedStatus, training: { loading: false, error: true } }}
      />,
    )
    const card = container.querySelector('[data-testid="mc-card-training-courses"]')
    expect(card?.textContent).toContain('Unavailable')
  })

  // -------------------------------------------------------------------------
  // OpenEngine degraded states
  // -------------------------------------------------------------------------

  it('openengine card shows Unavailable when openengine query errors', () => {
    const { container } = render(
      <MissionControlHome
        status={{ ...resolvedStatus, openengine: { loading: false, error: true } }}
      />,
    )
    const card = container.querySelector('[data-testid="mc-card-openengine-work"]')
    expect(card?.textContent).toContain('Unavailable')
  })

  it('openengine card shows "OpenEngine offline" when reachable is false', () => {
    const { container } = render(
      <MissionControlHome
        status={{
          ...resolvedStatus,
          openengine: { loading: false, reachable: false },
        }}
      />,
    )
    const card = container.querySelector('[data-testid="mc-card-openengine-work"]')
    expect(card?.textContent).toContain('OpenEngine offline')
  })

  // -------------------------------------------------------------------------
  // Research card: static, no API fetch, no readiness claim
  // -------------------------------------------------------------------------

  it('research card shows static "Open to check status" text', () => {
    const { container } = render(<MissionControlHome status={resolvedStatus} />)
    const card = container.querySelector('[data-testid="mc-card-research-review"]')
    expect(card?.textContent).toContain('Open to check status')
  })

  it('research card does not show "Index ready" or "Loading" text', () => {
    const { container } = render(<MissionControlHome status={resolvedStatus} />)
    const card = container.querySelector('[data-testid="mc-card-research-review"]')
    expect(card?.textContent).not.toContain('Index ready')
    expect(card?.textContent).not.toContain('Loading')
  })
})

