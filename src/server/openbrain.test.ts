import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Pool } from 'pg'
import {
  isOpenBrainConfigured,
  readOpenBrainStats,
  resetOpenBrainPool,
} from './openbrain'

const query = vi.fn()

vi.mock('pg', () => ({
  Pool: vi.fn(() => ({
    query,
    on: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  })),
}))

/**
 * Classify a query. Order matters: the counts query reads every table via
 * scalar subqueries, so it contains "FROM memory" and "FROM projects" too and
 * must be matched first by something unique to it.
 */
function classify(sql: string): 'counts' | 'memory' | 'projects' {
  if (sql.includes('AS memory_entries')) return 'counts'
  if (sql.includes('ORDER BY date DESC')) return 'memory'
  return 'projects'
}

function respondBySql(handlers: {
  counts?: unknown
  memory?: Array<Record<string, unknown>>
  projects?: Array<Record<string, unknown>>
}) {
  query.mockImplementation((sql: string) => {
    switch (classify(sql)) {
      case 'memory':
        return Promise.resolve({ rows: handlers.memory ?? [] })
      case 'projects':
        return Promise.resolve({ rows: handlers.projects ?? [] })
      default:
        return Promise.resolve({ rows: [handlers.counts ?? {}] })
    }
  })
}

describe('openbrain telemetry reader', () => {
  beforeEach(() => {
    process.env.OPENBRAIN_DB_URL = 'postgres://ro:pw@127.0.0.1:5433/openbrain'
  })

  afterEach(async () => {
    await resetOpenBrainPool()
    delete process.env.OPENBRAIN_DB_URL
    query.mockReset()
    vi.mocked(Pool).mockClear()
  })

  it('treats a missing OPENBRAIN_DB_URL as unconfigured', () => {
    delete process.env.OPENBRAIN_DB_URL
    expect(isOpenBrainConfigured()).toBe(false)

    process.env.OPENBRAIN_DB_URL = '   '
    expect(isOpenBrainConfigured()).toBe(false)

    process.env.OPENBRAIN_DB_URL = 'postgres://ro:pw@127.0.0.1:5433/openbrain'
    expect(isOpenBrainConfigured()).toBe(true)
  })

  it('coerces bigint counts, which pg returns as strings', async () => {
    respondBySql({
      counts: {
        context_items: '42',
        decisions: '173',
        projects: '8',
        clients: '9',
        memory_entries: '1295',
        routing: '4',
      },
    })

    const stats = await readOpenBrainStats()

    expect(stats.counts).toEqual({
      contextItems: 42,
      decisions: 173,
      projects: 8,
      clients: 9,
      memoryEntries: 1295,
      routing: 4,
    })
  })

  it('reads the OpenBrain columns this panel depends on', async () => {
    // Pins the schema contract: the workspace queries OpenBrain's tables
    // directly, so a rename upstream should fail here loudly rather than
    // silently blanking the card.
    const createdAt = new Date('2026-08-05T22:56:46Z')
    respondBySql({
      memory: [
        {
          id: 7,
          date: '2026-08-05',
          scope: 'aiacopilot',
          category: 'decision',
          content: 'Use a read-only role instead of a second service.',
          importance: 8,
          created_at: createdAt,
        },
      ],
      projects: [
        {
          id: 3,
          name: 'AIA-WebUI Mission Control',
          business: 'aiacopilot',
          status: 'active',
          owner: 'Scott',
          priority: 'P1',
        },
      ],
    })

    const stats = await readOpenBrainStats()

    expect(stats.recentMemory[0]).toEqual({
      id: 7,
      date: '2026-08-05',
      scope: 'aiacopilot',
      category: 'decision',
      content: 'Use a read-only role instead of a second service.',
      importance: 8,
      createdAt: createdAt.toISOString(),
    })
    expect(stats.activeProjects[0]).toEqual({
      id: 3,
      name: 'AIA-WebUI Mission Control',
      business: 'aiacopilot',
      status: 'active',
      owner: 'Scott',
      priority: 'P1',
    })
  })

  it('excludes finished work from active projects and bounds recent memory', async () => {
    respondBySql({})
    await readOpenBrainStats()

    const sqls = query.mock.calls.map(([sql]) => String(sql))
    const projectsSql = sqls.find((sql) => classify(sql) === 'projects')
    const memorySql = sqls.find((sql) => classify(sql) === 'memory')

    expect(projectsSql).toMatch(/NOT IN \('complete', 'archived'\)/)
    expect(memorySql).toMatch(/LIMIT \$2/)
    // Content is previewed, not returned whole — this feeds a card.
    expect(memorySql).toMatch(/left\(content, \$1\)/)
  })

  it('surfaces connection failures to the caller', async () => {
    query.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:5433'))
    await expect(readOpenBrainStats()).rejects.toThrow('ECONNREFUSED')
  })
})
