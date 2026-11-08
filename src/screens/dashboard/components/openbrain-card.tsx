import { useQuery } from '@tanstack/react-query'
import type { BrainMetadata } from '../../../server/openbrain'
export function formatCount(value: number): string { return value.toLocaleString() }
export function isKeyMemory(importance: number | null): boolean { return (importance ?? 0) >= 7 }
export type OpenBrainStatsResponse = Partial<BrainMetadata> & { available: boolean; reason?: string }
export function OpenBrainCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['openbrain-stats'], queryFn: async (): Promise<OpenBrainStatsResponse> => {
      const response = await fetch('/api/openbrain-stats', { cache: 'no-store' })
      if (!response.ok) throw new Error('Unavailable')
      return response.json()
    }, refetchInterval: 60000, staleTime: 0, retry: false,
  })
  const state = isLoading ? 'checking' : isError ? 'unavailable' : data?.status ?? 'unavailable'
  return <section aria-label="AIA Brain" className="rounded-xl border p-3 text-sm"
    style={{ color: 'var(--theme-text)', background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}>
    <h3>AIA Brain · {state}</h3>
    <p>Read-only metadata · designated reader · archive excluded</p>
    {data?.generatedAt && <p>Snapshot: <time dateTime={data.generatedAt}>{data.generatedAt}</time></p>}
    {!isError && data?.available && data.counts ? <dl>
      <dt>Readable files</dt><dd>{formatCount(data.counts.readableFiles)}</dd>
      <dt>Anchor files verified</dt><dd>{data.counts.verifiedAnchors}/{data.counts.anchorSources}</dd>
      <dt>Admitted operations notes</dt><dd>{data.counts.admittedOperationsNotes}</dd>
    </dl> : <p>{data?.reason ?? 'Brain reader metadata unavailable. No legacy fallback.'}</p>}
    {state === 'stale' && <p>Stale snapshot: last observed counts, not live health.</p>}
    <p>These are file counts, not legacy entities, decisions, clients or projects.</p>
  </section>
}
