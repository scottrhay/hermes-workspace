/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSearchData } from './use-search-data'
import type { ReactNode } from 'react'

vi.mock('@/hooks/use-feature-available', () => ({
  useFeatureAvailable: () => true,
}))

describe('useSearchData', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('does not crawl sessions, files, or skills until search is opened', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )

    const { rerender } = renderHook(
      ({ enabled }) => useSearchData('all', '', enabled),
      { initialProps: { enabled: false }, wrapper },
    )

    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()

    rerender({ enabled: true })
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  })
})

