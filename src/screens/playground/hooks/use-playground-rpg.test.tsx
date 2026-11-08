import { StrictMode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlaygroundRpg } from './use-playground-rpg'
import { PLAYGROUND_QUESTS, itemById } from '../lib/playground-rpg'

beforeEach(() => { localStorage.clear(); vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers() })

describe('quest completion notifications', () => {
  it('announces committed batched objectives once in StrictMode, including rewards', () => {
    const quest = PLAYGROUND_QUESTS.find((entry) => entry.reward.items?.length && entry.reward.title)!
    expect(quest).toBeDefined()
    const { result } = renderHook(() => usePlaygroundRpg(), { wrapper: StrictMode })
    act(() => {
      result.current.setDisplayName('Builder')
      for (const objective of quest.objectives) result.current.markObjective(quest.id, objective.id)
    })
    expect(result.current.state.completedQuests).toContain(quest.id)
    expect(result.current.toasts.filter((toast) => toast.kind === 'quest')).toHaveLength(1)
    expect(result.current.toasts.map((toast) => toast.body)).toEqual(expect.arrayContaining([
      quest.title, `+${quest.reward.xp} XP`, quest.reward.title,
      ...quest.reward.items!.map((id) => itemById(id)!.name),
    ]))
    const count = result.current.toasts.length
    act(() => { for (const objective of quest.objectives) result.current.markObjective(quest.id, objective.id) })
    expect(result.current.toasts).toHaveLength(count)
  })

  it('does not reannounce saved completions, but allows tutorial replay', () => {
    const quest = PLAYGROUND_QUESTS[0]
    const first = renderHook(() => usePlaygroundRpg())
    act(() => first.result.current.completeQuestById(quest.id))
    first.unmount()
    const { result } = renderHook(() => usePlaygroundRpg(), { wrapper: StrictMode })
    expect(result.current.toasts).toHaveLength(0)
    act(() => result.current.replayTutorial())
    act(() => result.current.completeQuestById(quest.id))
    expect(result.current.toasts.filter((toast) => toast.kind === 'quest')).toHaveLength(1)
  })

  it('does not announce partial objectives or repeat a direct completion', () => {
    const quest = PLAYGROUND_QUESTS.find((entry) => entry.objectives.length > 1)!
    const { result } = renderHook(() => usePlaygroundRpg())
    act(() => result.current.markObjective(quest.id, quest.objectives[0].id))
    expect(result.current.toasts).toHaveLength(0)
    act(() => result.current.completeQuestById(quest.id))
    expect(result.current.toasts.filter((toast) => toast.kind === 'quest')).toHaveLength(1)
    const count = result.current.toasts.length
    act(() => result.current.completeQuestById(quest.id))
    expect(result.current.toasts).toHaveLength(count)
  })
})
