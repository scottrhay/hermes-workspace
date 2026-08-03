import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OEConfigError,
  OEUnavailableError,
  fetchOEWorkItemDetail,
  fetchOEWorkItems,
  resolveOEBase,
} from './openengine-client'

const originalEnv: Record<string, string | undefined> = {}

function setEnv(key: string, value: string | undefined) {
  if (!(key in originalEnv)) originalEnv[key] = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  for (const key of Object.keys(originalEnv)) delete originalEnv[key]
})

// ---------------------------------------------------------------------------
// resolveOEBase
// ---------------------------------------------------------------------------

describe('resolveOEBase', () => {
  it('returns default loopback when no env set', () => {
    setEnv('OPENENGINE_URL', undefined)
    setEnv('VITE_OPENENGINE_URL', undefined)
    expect(resolveOEBase()).toBe('http://127.0.0.1:5227')
  })

  it('accepts a valid loopback OPENENGINE_URL', () => {
    setEnv('OPENENGINE_URL', 'http://127.0.0.1:9999')
    setEnv('VITE_OPENENGINE_URL', undefined)
    expect(resolveOEBase()).toBe('http://127.0.0.1:9999')
  })

  it('accepts localhost as loopback', () => {
    setEnv('OPENENGINE_URL', 'http://localhost:5227')
    setEnv('VITE_OPENENGINE_URL', undefined)
    expect(resolveOEBase()).toBe('http://localhost:5227')
  })

  it('throws OEConfigError for non-loopback URL', () => {
    setEnv('OPENENGINE_URL', 'http://10.0.0.1:5227')
    setEnv('VITE_OPENENGINE_URL', undefined)
    expect(() => resolveOEBase()).toThrow(OEConfigError)
    expect(() => resolveOEBase()).toThrow(/loopback/)
  })

  it('throws OEConfigError for external URL', () => {
    setEnv('OPENENGINE_URL', 'https://openengine.example.com')
    setEnv('VITE_OPENENGINE_URL', undefined)
    expect(() => resolveOEBase()).toThrow(OEConfigError)
  })

  it('throws OEConfigError for invalid URL string', () => {
    setEnv('OPENENGINE_URL', 'not-a-url')
    setEnv('VITE_OPENENGINE_URL', undefined)
    expect(() => resolveOEBase()).toThrow(OEConfigError)
  })
})

// ---------------------------------------------------------------------------
// fetchOEWorkItems
// ---------------------------------------------------------------------------

describe('fetchOEWorkItems', () => {
  beforeEach(() => {
    setEnv('OPENENGINE_URL', 'http://127.0.0.1:5227')
    setEnv('VITE_OPENENGINE_URL', undefined)
  })

  it('returns normalized items from { items: [...] }', async () => {
    const mockRes = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        items: [
          {
            id: 'abc-123',
            title: 'Test item',
            type: 'feature',
            tier: 'full_spec',
            summary: 'A test',
            owner: 'default',
            priority: 'P0',
            status: 'in_progress',
            workflow_mode: 'governed',
            created_by: 'default',
            requires_deployment: true,
            requires_openbrain_log: false,
            forge: { red: 2, yellow: 1, green: 3, not_applicable: 0 },
            updated_at: '2026-08-03T10:00:00Z',
            latest_receipt: {
              id: 'r1',
              receipt_type: 'AGENT PROGRESS',
              actor: 'default',
              summary: 'Progress note',
              created_at: '2026-08-03T09:00:00Z',
            },
          },
        ],
      }),
    }
    vi.mocked(fetch).mockResolvedValue(mockRes as unknown as Response)

    const items = await fetchOEWorkItems()

    expect(items).toHaveLength(1)
    const item = items[0]
    expect(item.id).toBe('abc-123')
    expect(item.title).toBe('Test item')
    expect(item.type).toBe('feature')
    expect(item.tier).toBe('full_spec')
    expect(item.owner).toBe('default')
    expect(item.priority).toBe('P0')
    expect(item.status).toBe('in_progress')
    expect(item.forge).toEqual({ red: 2, yellow: 1, green: 3, notApplicable: 0 })
    expect(item.latestReceipt).not.toBeNull()
    expect(item.latestReceipt?.receiptType).toBe('AGENT PROGRESS')
    expect(item.latestReceipt?.actor).toBe('default')
  })

  it('returns empty array when items is missing', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response)

    const items = await fetchOEWorkItems()
    expect(items).toEqual([])
  })

  it('throws OEUnavailableError when fetch rejects', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(fetchOEWorkItems()).rejects.toThrow(OEUnavailableError)
    await expect(fetchOEWorkItems()).rejects.toThrow(/unreachable/)
  })

  it('throws OEUnavailableError on non-ok HTTP response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response)

    await expect(fetchOEWorkItems()).rejects.toThrow(OEUnavailableError)
    await expect(fetchOEWorkItems()).rejects.toThrow(/500/)
  })

  it('throws OEUnavailableError on non-JSON response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('invalid json')),
    } as unknown as Response)

    await expect(fetchOEWorkItems()).rejects.toThrow(OEUnavailableError)
    await expect(fetchOEWorkItems()).rejects.toThrow(/non-JSON/)
  })
})

// ---------------------------------------------------------------------------
// fetchOEWorkItemDetail
// ---------------------------------------------------------------------------

describe('fetchOEWorkItemDetail', () => {
  beforeEach(() => {
    setEnv('OPENENGINE_URL', 'http://127.0.0.1:5227')
    setEnv('VITE_OPENENGINE_URL', undefined)
  })

  it('returns normalized detail including receipts and forge_dimensions', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        id: 'abc-123',
        title: 'Test item',
        status: 'in_progress',
        updated_at: '2026-08-03T10:00:00Z',
        created_at: '2026-08-01T00:00:00Z',
        acceptance_criteria: 'Must pass all tests',
        forge: { red: 0, yellow: 0, green: 2, not_applicable: 0 },
        receipts: [
          {
            id: 'r1',
            receipt_type: 'AGENT PROGRESS',
            actor: 'default',
            summary: 'Done',
            created_at: '2026-08-03T09:00:00Z',
          },
        ],
        forge_dimensions: [
          {
            dimension: 'requirements',
            status: 'green',
            applicable: true,
            owner: 'default',
            verifier: null,
            notes: '',
          },
          {
            dimension: 'test',
            status: 'red',
            applicable: true,
            owner: null,
            verifier: null,
            notes: 'Not started',
          },
        ],
      }),
    } as unknown as Response)

    const detail = await fetchOEWorkItemDetail('abc-123')

    expect(detail.id).toBe('abc-123')
    expect(detail.createdAt).toBe('2026-08-01T00:00:00Z')
    expect(detail.acceptanceCriteria).toBe('Must pass all tests')
    expect(detail.receipts).toHaveLength(1)
    expect(detail.receipts[0].receiptType).toBe('AGENT PROGRESS')
    expect(detail.forgeDimensions).toHaveLength(2)
    expect(detail.forgeDimensions[0].dimension).toBe('requirements')
    expect(detail.forgeDimensions[0].status).toBe('green')
    expect(detail.forgeDimensions[1].dimension).toBe('test')
    expect(detail.forgeDimensions[1].status).toBe('red')
  })

  it('throws OEConfigError for invalid id', async () => {
    await expect(fetchOEWorkItemDetail('')).rejects.toThrow(OEConfigError)
    await expect(fetchOEWorkItemDetail('../etc/passwd')).rejects.toThrow(OEConfigError)
  })

  it('throws OEUnavailableError with 404 statusCode on 404 response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
    } as unknown as Response)

    const err = await fetchOEWorkItemDetail('abc-123').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(OEUnavailableError)
    expect((err as OEUnavailableError).statusCode).toBe(404)
  })

  it('throws OEUnavailableError when fetch rejects', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(fetchOEWorkItemDetail('abc-123')).rejects.toThrow(OEUnavailableError)
  })

  it('handles missing optional fields gracefully', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        id: 'min-item',
        title: 'Minimal',
        status: 'intake',
        updated_at: '2026-08-01T00:00:00Z',
      }),
    } as unknown as Response)

    const detail = await fetchOEWorkItemDetail('min-item')
    expect(detail.acceptanceCriteria).toBeNull()
    expect(detail.receipts).toEqual([])
    expect(detail.forgeDimensions).toEqual([])
    expect(detail.latestReceipt).toBeNull()
  })
})
