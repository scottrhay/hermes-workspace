import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { BrainMetadata } from '../../server/openbrain'
import { readOpenBrainStats } from '../../server/openbrain'

vi.mock('../../server/openbrain', () => ({ readOpenBrainStats: vi.fn() }))
const STATS: BrainMetadata = {
  schemaVersion: 2, generatedAt: '2026-11-06T15:00:00.000Z', status: 'current',
  scope: 'aiacopilot:operations', coverage: 'designated-reader', fallback: false,
  counts: { readableFiles: 257, anchorSources: 5, verifiedAnchors: 5, admittedOperationsNotes: 1 },
  admissionRevision: 1,
}
let auth: typeof import('../../server/auth-middleware')
let token: string
let home: string
let url: string
let server: ReturnType<typeof createServer>
beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), 'brain-route-auth-'))
  vi.stubEnv('HERMES_HOME', home)
  vi.stubEnv('HERMES_PASSWORD', 'isolated-test-only-not-a-live-password')
  // Capture only auth's maintenance interval, not HTTP timers.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  auth = await import('../../server/auth-middleware')
  const { Route } = await import('./openbrain-stats')
  const handler = (Route as unknown as { options: { server: { handlers: {
    GET: (ctx: { request: Request }) => Promise<Response>
  } } } }).options.server.handlers.GET
  server = createServer(async (req, res) => {
    try {
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value)
      }
      const response = await handler({ request: new Request(new URL(req.url || '/', url), { headers }) })
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(await response.text())
    } catch { res.writeHead(500); res.end('harness error') }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test port')
  url = `http://127.0.0.1:${address.port}`
})
beforeEach(() => {
  token = auth.generateSessionToken()
  auth.storeSessionToken(token)
  vi.mocked(readOpenBrainStats).mockResolvedValue(STATS)
})
afterEach(() => {
  auth.revokeSessionToken(token)
  vi.resetAllMocks()
})
afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  await rm(home, { recursive: true, force: true })
})
const request = (cookie?: string, query = '') => fetch(`${url}/api/openbrain-stats${query}`, {
  headers: cookie === undefined ? {} : { cookie: `claude-auth=${cookie}` },
})
describe('metadata HTTP route with real session authorization', () => {
  it.each(['missing', 'forged', 'revoked'])('denies %s session before reading', async (kind) => {
    if (kind === 'revoked') auth.revokeSessionToken(token)
    const response = await request(kind === 'missing' ? undefined : kind === 'forged' ? 'forged' : token)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(readOpenBrainStats).not.toHaveBeenCalled()
  })
  it.each(['current', 'stale', 'unavailable'] as const)('returns %s with no-store', async (status) => {
    const metadata = { ...STATS, status }
    if (status === 'unavailable') { delete metadata.counts; delete metadata.admissionRevision }
    vi.mocked(readOpenBrainStats).mockResolvedValue(metadata)
    const response = await request(token)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ configured: true, available: status !== 'unavailable', ...metadata })
  })
  it('never forwards caller path/scope/command', async () => {
    expect((await request(token, '?path=/etc/passwd&scope=private&command=read')).status).toBe(200)
    expect(readOpenBrainStats).toHaveBeenCalledExactlyOnceWith()
  })
  it('sanitizes read errors with no legacy fallback', async () => {
    vi.mocked(readOpenBrainStats).mockRejectedValue(new Error('secret-opaque-1957 /private/file'))
    const response = await request(token)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json()
    expect(body.available).toBe(false)
    expect(body.status).toBe('unavailable')
    expect(body.reason).toContain('No legacy fallback')
    expect(JSON.stringify(body)).not.toContain('secret-opaque-1957')
  })
})
