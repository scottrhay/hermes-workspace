/**
 * Server-side OpenEngine upstream client.
 *
 * Validates that the upstream is loopback-only, never accepts a caller-supplied
 * URL, and returns explicit typed errors rather than leaking raw upstream shapes.
 */

const OE_LOOPBACK_DEFAULT = 'http://127.0.0.1:5227'

const LOOPBACK_ORIGINS = new Set([
  'http://127.0.0.1',
  'http://localhost',
  'http://[::1]',
])

export class OEUnavailableError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'OEUnavailableError'
  }
}

export class OEConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OEConfigError'
  }
}

/**
 * Resolve and validate the OE base URL. Throws OEConfigError if the
 * configured URL is not a loopback address — this prevents SSRF even if
 * an env var is misconfigured.
 */
export function resolveOEBase(): string {
  const raw =
    process.env.OPENENGINE_URL ??
    process.env.VITE_OPENENGINE_URL ??
    OE_LOOPBACK_DEFAULT

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new OEConfigError(`OPENENGINE_URL is not a valid URL: ${raw}`)
  }

  const origin = `${parsed.protocol}//${parsed.hostname}`
  if (!LOOPBACK_ORIGINS.has(origin)) {
    throw new OEConfigError(
      `OPENENGINE_URL must be a loopback address (got ${parsed.hostname}). ` +
        'Caller-supplied upstream URLs are not accepted.',
    )
  }

  return `${parsed.protocol}//${parsed.host}`
}

// ---------------------------------------------------------------------------
// Normalized types
// ---------------------------------------------------------------------------

export interface OEReceipt {
  id: string
  receiptType: string
  actor: string
  summary: string
  createdAt: string
}

export interface OEForgeDimension {
  dimension: string
  status: string
  applicable: boolean
  owner: string | null
  verifier: string | null
  notes: string
}

export interface OEWorkItem {
  id: string
  title: string
  type: string | null
  tier: string | null
  summary: string | null
  owner: string | null
  priority: string | null
  status: string
  workflowMode: string | null
  createdBy: string | null
  requiresDeployment: boolean
  requiresOpenBrainLog: boolean
  forge: { red: number; yellow: number; green: number; notApplicable: number }
  updatedAt: string
  latestReceipt: OEReceipt | null
}

export interface OEWorkItemDetail extends OEWorkItem {
  createdAt: string
  acceptanceCriteria: string | null
  receipts: OEReceipt[]
  forgeDimensions: OEForgeDimension[]
}

// ---------------------------------------------------------------------------
// Raw API shapes (what OE actually returns)
// ---------------------------------------------------------------------------

interface RawReceipt {
  id: string
  receipt_type: string
  actor: string
  summary: string
  created_at: string
}

interface RawForge {
  red: number
  yellow: number
  green: number
  not_applicable: number
}

interface RawWorkItem {
  id: string
  title: string
  type?: string | null
  tier?: string | null
  summary?: string | null
  owner?: string | null
  priority?: string | null
  status: string
  workflow_mode?: string | null
  created_by?: string | null
  requires_deployment?: boolean
  requires_openbrain_log?: boolean
  forge?: RawForge
  updated_at: string
  latest_receipt?: RawReceipt | null
}

interface RawWorkItemDetail extends RawWorkItem {
  created_at?: string
  acceptance_criteria?: string | null
  receipts?: RawReceipt[]
  forge_dimensions?: Array<{
    dimension: string
    status: string
    applicable: boolean
    owner?: string | null
    verifier?: string | null
    notes?: string
  }>
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

function normalizeReceipt(r: RawReceipt): OEReceipt {
  return {
    id: r.id,
    receiptType: r.receipt_type ?? '',
    actor: r.actor ?? '',
    summary: r.summary ?? '',
    createdAt: r.created_at ?? '',
  }
}

function normalizeWorkItem(raw: RawWorkItem): OEWorkItem {
  return {
    id: raw.id,
    title: raw.title ?? '',
    type: raw.type ?? null,
    tier: raw.tier ?? null,
    summary: raw.summary ?? null,
    owner: raw.owner ?? null,
    priority: raw.priority ?? null,
    status: raw.status ?? 'unknown',
    workflowMode: raw.workflow_mode ?? null,
    createdBy: raw.created_by ?? null,
    requiresDeployment: raw.requires_deployment ?? false,
    requiresOpenBrainLog: raw.requires_openbrain_log ?? false,
    forge: {
      red: raw.forge?.red ?? 0,
      yellow: raw.forge?.yellow ?? 0,
      green: raw.forge?.green ?? 0,
      notApplicable: raw.forge?.not_applicable ?? 0,
    },
    updatedAt: raw.updated_at ?? '',
    latestReceipt: raw.latest_receipt ? normalizeReceipt(raw.latest_receipt) : null,
  }
}

// ---------------------------------------------------------------------------
// Public fetch functions
// ---------------------------------------------------------------------------

export async function fetchOEWorkItems(): Promise<OEWorkItem[]> {
  const base = resolveOEBase()
  let res: Response
  try {
    res = await fetch(`${base}/api/work-items`, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    })
  } catch (err) {
    throw new OEUnavailableError(
      `OpenEngine unreachable at ${base}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    throw new OEUnavailableError(
      `OpenEngine returned ${res.status} for /api/work-items`,
      res.status,
    )
  }

  let body: { items?: RawWorkItem[] }
  try {
    body = (await res.json()) as { items?: RawWorkItem[] }
  } catch {
    throw new OEUnavailableError('OpenEngine returned non-JSON from /api/work-items')
  }

  return (body.items ?? []).map(normalizeWorkItem)
}

export async function fetchOEWorkItemDetail(id: string): Promise<OEWorkItemDetail> {
  if (!id || !/^[\w-]+$/.test(id)) {
    throw new OEConfigError(`Invalid work-item id: ${JSON.stringify(id)}`)
  }

  const base = resolveOEBase()
  let res: Response
  try {
    res = await fetch(`${base}/api/work-items/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    })
  } catch (err) {
    throw new OEUnavailableError(
      `OpenEngine unreachable at ${base}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (res.status === 404) {
    throw new OEUnavailableError(`Work item ${id} not found`, 404)
  }

  if (!res.ok) {
    throw new OEUnavailableError(
      `OpenEngine returned ${res.status} for /api/work-items/${id}`,
      res.status,
    )
  }

  let raw: RawWorkItemDetail
  try {
    raw = (await res.json()) as RawWorkItemDetail
  } catch {
    throw new OEUnavailableError('OpenEngine returned non-JSON from /api/work-items/{id}')
  }

  return {
    ...normalizeWorkItem(raw),
    createdAt: raw.created_at ?? '',
    acceptanceCriteria: raw.acceptance_criteria ?? null,
    receipts: (raw.receipts ?? []).map(normalizeReceipt),
    forgeDimensions: (raw.forge_dimensions ?? []).map((d) => ({
      dimension: d.dimension ?? '',
      status: d.status ?? '',
      applicable: d.applicable ?? true,
      owner: d.owner ?? null,
      verifier: d.verifier ?? null,
      notes: d.notes ?? '',
    })),
  }
}
