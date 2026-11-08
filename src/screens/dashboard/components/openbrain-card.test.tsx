// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OpenBrainCard } from './openbrain-card'

const metadata = {
  schemaVersion: 2, generatedAt: '2026-11-06T15:00:00.000Z', status: 'current',
  scope: 'aiacopilot:operations', coverage: 'designated-reader', fallback: false,
  available: true, counts: { readableFiles: 1257, anchorSources: 5, verifiedAnchors: 5, admittedOperationsNotes: 1 },
}
let client: QueryClient
function mount(value: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => value }))
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={client}><OpenBrainCard /></QueryClientProvider>)
}
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals() })
describe('AIA Brain card', () => {
  it('renders honest counts and coverage without legacy entity labels', async () => {
    mount(metadata)
    await screen.findByText('AIA Brain · current')
    expect(screen.getByText('Readable files')).toBeTruthy()
    expect(screen.getByText((1257).toLocaleString())).toBeTruthy()
    expect(screen.getByText('Anchor files verified')).toBeTruthy()
    expect(screen.getByText('5/5')).toBeTruthy()
    expect(screen.getByText('Admitted operations notes')).toBeTruthy()
    expect(screen.getByText(/designated reader · archive excluded/)).toBeTruthy()
    expect(screen.queryByText(/approved sources only/)).toBeNull()
    expect(screen.getByText('These are file counts, not legacy entities, decisions, clients or projects.')).toBeTruthy()
    expect(document.querySelector('time')?.getAttribute('datetime')).toBe(metadata.generatedAt)
    expect(fetch).toHaveBeenCalledWith('/api/openbrain-stats', { cache: 'no-store' })
  })
  it('labels stale counts as not live', async () => {
    mount({ ...metadata, status: 'stale' })
    await screen.findByText('AIA Brain · stale')
    expect(screen.getByText('Stale snapshot: last observed counts, not live health.')).toBeTruthy()
  })
  it('shows unavailable without counts', async () => {
    mount({ status: 'unavailable', available: false })
    await screen.findByText('AIA Brain · unavailable')
    expect(screen.queryByText('Readable files')).toBeNull()
    expect(screen.getByText('Brain reader metadata unavailable. No legacy fallback.')).toBeTruthy()
  })
  it('shows unavailable when HTTP authentication fails', async () => {
    mount({}, false)
    await screen.findByText('AIA Brain · unavailable')
    expect(screen.queryByText('Readable files')).toBeNull()
  })
})
