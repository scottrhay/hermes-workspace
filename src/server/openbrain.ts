/**
 * OpenBrain telemetry reader.
 *
 * OpenBrain is Scott's durable memory system (PostgreSQL, normally reached
 * through its MCP server on :3600). Its dashboard exposes /api/stats, but we
 * deliberately do not run that second service — instead the workspace reads
 * the same six tables directly over a dedicated, least-privilege role
 * (`openbrain_readonly`: CONNECT + USAGE + SELECT on those tables only).
 *
 * The queries here mirror OpenBrain's own /api/stats so both surfaces report
 * the same numbers. Because this reaches into OpenBrain's schema rather than
 * its API, a schema change there will surface here — the colocated tests pin
 * the column names so that breakage is loud rather than silent.
 *
 * Everything degrades gracefully: an unset OPENBRAIN_DB_URL or an unreachable
 * database is a missing capability, not an error, matching how the rest of the
 * workspace handles absent backends.
 */
// Type-only: erased at compile time. `pg` is a Node-only driver and this
// module is reachable from the generated route tree, so a value import would
// pull it into the client module graph and break browser-environment builds
// and tests. The driver is loaded dynamically in getPool() instead.
import type { Pool } from 'pg'

export type OpenBrainCounts = {
  contextItems: number
  decisions: number
  projects: number
  clients: number
  memoryEntries: number
  routing: number
}

export type OpenBrainMemoryEntry = {
  id: number
  date: string | null
  scope: string | null
  category: string | null
  content: string
  importance: number | null
  createdAt: string | null
}

export type OpenBrainProject = {
  id: number
  name: string
  business: string | null
  status: string | null
  owner: string | null
  priority: string | null
}

export type OpenBrainStats = {
  counts: OpenBrainCounts
  recentMemory: Array<OpenBrainMemoryEntry>
  activeProjects: Array<OpenBrainProject>
}

/** Preview length for memory content — this feeds a card, not a reader. */
const CONTENT_PREVIEW_CHARS = 240
const RECENT_MEMORY_LIMIT = 10

let pool: Pool | null = null

export function isOpenBrainConfigured(): boolean {
  return Boolean(process.env.OPENBRAIN_DB_URL?.trim())
}

async function getPool(): Promise<Pool> {
  if (pool) return pool
  const connectionString = process.env.OPENBRAIN_DB_URL?.trim()
  if (!connectionString) {
    throw new Error('OPENBRAIN_DB_URL is not set')
  }
  // @vite-ignore keeps Vite's import-analysis from resolving 'pg' for the
  // client graph (this module is reachable from the generated route tree).
  // The specifier is a constant, so this is only opaque to the bundler.
  const driver = 'pg'
  const { Pool: PgPool } = await import(/* @vite-ignore */ driver)
  // Small pool with tight timeouts: this backs a dashboard card, so a slow or
  // down OpenBrain must fail fast rather than hold the request open.
  pool = new PgPool({
    connectionString,
    max: 3,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 30_000,
    query_timeout: 5_000,
  })
  // A pool-level error (server restart, dropped socket) would otherwise be an
  // unhandled 'error' event and take the process down.
  pool.on('error', () => {})
  return pool
}

/** Test seam: drop the cached pool so a new OPENBRAIN_DB_URL takes effect. */
export async function resetOpenBrainPool(): Promise<void> {
  const current = pool
  pool = null
  if (current) await current.end().catch(() => {})
}

function toNumber(value: unknown): number {
  // pg returns bigint counts as strings to avoid precision loss.
  const parsed = typeof value === 'string' ? Number(value) : Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

export async function readOpenBrainStats(): Promise<OpenBrainStats> {
  const db = await getPool()

  const [countsResult, memoryResult, projectsResult] = await Promise.all([
    db.query(
      `SELECT
         (SELECT count(*) FROM context_items) AS context_items,
         (SELECT count(*) FROM decisions)     AS decisions,
         (SELECT count(*) FROM projects)      AS projects,
         (SELECT count(*) FROM clients)       AS clients,
         (SELECT count(*) FROM memory)        AS memory_entries,
         (SELECT count(*) FROM routing)       AS routing`,
    ),
    db.query(
      `SELECT id, date, scope, category,
              left(content, $1) AS content,
              importance, created_at
         FROM memory
        ORDER BY date DESC, created_at DESC
        LIMIT $2`,
      [CONTENT_PREVIEW_CHARS, RECENT_MEMORY_LIMIT],
    ),
    db.query(
      `SELECT id, name, business, status, owner, priority
         FROM projects
        WHERE status NOT IN ('complete', 'archived')
        ORDER BY priority, name`,
    ),
  ])

  const counts = countsResult.rows[0] ?? {}

  return {
    counts: {
      contextItems: toNumber(counts.context_items),
      decisions: toNumber(counts.decisions),
      projects: toNumber(counts.projects),
      clients: toNumber(counts.clients),
      memoryEntries: toNumber(counts.memory_entries),
      routing: toNumber(counts.routing),
    },
    recentMemory: memoryResult.rows.map((row) => ({
      id: toNumber(row.id),
      date: toIsoOrNull(row.date),
      scope: row.scope ?? null,
      category: row.category ?? null,
      content: row.content ?? '',
      importance: row.importance == null ? null : toNumber(row.importance),
      createdAt: toIsoOrNull(row.created_at),
    })),
    activeProjects: projectsResult.rows.map((row) => ({
      id: toNumber(row.id),
      name: row.name ?? '',
      business: row.business ?? null,
      status: row.status ?? null,
      owner: row.owner ?? null,
      priority: row.priority ?? null,
    })),
  }
}
