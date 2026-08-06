/** @vitest-environment jsdom */
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileSetupModal } from './MobileSetupModal'

describe('MobileSetupModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('does not resolve a network URL while the modal is closed', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ url: 'http://localhost:3000', source: 'localhost' }),
          { status: 200 },
        ),
      )

    const { rerender } = render(
      <MobileSetupModal isOpen={false} onClose={() => {}} />,
    )
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()

    rerender(<MobileSetupModal isOpen onClose={() => {}} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })
})

