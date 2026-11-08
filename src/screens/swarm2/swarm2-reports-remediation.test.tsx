// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Swarm2ReportsView } from './swarm2-reports-view'

vi.mock('@/components/agent-view/agent-progress', () => ({
  AgentProgress: ({ status }: { status: string }) => <span data-testid="progress">{status}</span>,
}))
vi.mock('@/components/agent-swarm/pixel-avatar', () => ({ PixelAvatar: () => null }))
afterEach(cleanup)

describe('report card consumer contracts', () => {
  it('renders the latest report PR and steers the actual inbox item, not the aggregate worker card', () => {
    const steer = vi.fn()
    render(<Swarm2ReportsView missions={[{
      id: 'mission-1', title: 'Ship change', state: 'done', updatedAt: 100,
      assignments: [{ id: 'assignment-1', workerId: 'builder', task: 'Implement change', state: 'done', checkpoint: { result: 'Shipped https://github.com/example/repo/pull/42' } }],
    }]} runtimes={[]} onRouteToReviewer={steer} />)
    expect(screen.getByTestId('progress').textContent).toBe('complete')
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://github.com/example/repo/pull/42')
    fireEvent.click(screen.getByRole('button', { name: 'Steer' }))
    expect(steer).toHaveBeenCalledWith(expect.objectContaining({
      workerId: 'builder', missionId: 'mission-1', assignmentId: 'assignment-1', lane: 'ready', state: 'ready', kind: 'checkpoint',
    }))
    expect(steer.mock.calls[0][0].id).toEqual(expect.any(String))
  })
})
