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

export type OEListResponse =
  | { ok: true; items: OEWorkItem[] }
  | { ok: false; error: string; detail?: string }

export type OEDetailResponse =
  | { ok: true; item: OEWorkItemDetail }
  | { ok: false; error: string; detail?: string }

// ---------------------------------------------------------------------------
// Status ordering/display
// ---------------------------------------------------------------------------

export const STATUS_ORDER: string[] = [
  'in_progress',
  'human_hold',
  'blocked',
  'review_requested',
  'changes_requested',
  'ready',
  'spec_required',
  'triage',
  'intake',
  'cancelled',
  'closed',
]

export const STATUS_LABEL: Record<string, string> = {
  in_progress: 'In Progress',
  human_hold: 'Human Hold',
  blocked: 'Blocked',
  review_requested: 'Review Requested',
  changes_requested: 'Changes Requested',
  ready: 'Ready',
  spec_required: 'Spec Required',
  triage: 'Triage',
  intake: 'Intake',
  cancelled: 'Cancelled',
  closed: 'Closed',
}

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status.replace(/_/g, ' ')
}

export const PRIORITY_ORDER: string[] = ['urgent', 'P0', 'P1', 'P2', 'P3', 'high', 'medium']

export function prioritySort(a: string | null, b: string | null): number {
  const ai = PRIORITY_ORDER.indexOf(a ?? '')
  const bi = PRIORITY_ORDER.indexOf(b ?? '')
  if (ai === -1 && bi === -1) return (a ?? '').localeCompare(b ?? '')
  if (ai === -1) return 1
  if (bi === -1) return -1
  return ai - bi
}
