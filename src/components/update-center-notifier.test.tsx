/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  UpdateCenterNotifier,
  __updateReleaseNotesStorageForTests,
} from './update-center-notifier'

const { NOTES_SEEN_KEY, storeNotes } = __updateReleaseNotesStorageForTests

const agentReleaseNotes = [
  {
    product: 'agent' as const,
    label: 'Hermes Agent',
    from: 'c23a87bc163b188abc7e40fbdccf07a9739231c3',
    to: '4fdfdf67499c33015ed56e6e5910d8bdc00aa901',
    commits: ['Merge pull request #25045 (4fdfdf674)'],
  },
]

function installLocalStorage() {
  const store = new Map<string, string>()
  const storage = {
    get length() {
      return store.size
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    getItem(key: string) {
      return store.get(key) ?? null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  })
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  })
}

beforeEach(() => {
  installLocalStorage()
})

describe('update center release notes storage', () => {
  it('does not reopen release notes already marked seen when status returns the same payload', () => {
    const firstStored = storeNotes(agentReleaseNotes)

    expect(firstStored).not.toBeNull()
    localStorage.setItem(NOTES_SEEN_KEY, firstStored!.id)

    expect(storeNotes(agentReleaseNotes)).toBeNull()
  })

  it('defers the expensive update probe until the workspace is usable', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ products: {} }), { status: 200 }),
      )
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={client}>
        <UpdateCenterNotifier />
      </QueryClientProvider>,
    )

    act(() => {
      vi.advanceTimersByTime(14_999)
    })
    expect(fetchMock).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/update/status')
    vi.useRealTimers()
  })
})

