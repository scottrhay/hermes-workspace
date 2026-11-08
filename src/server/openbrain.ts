/**
 * Read-only, bounded metadata snapshot. Never opens the legacy database.
 * Schema 2 (2026-11-07): counts from Ariel's designated Brain reader, which reads the whole
 * Brain except its archive; schema 1 described the retired five-file restricted reader.
 */
export type BrainMetadata = {
  schemaVersion: 2
  generatedAt: string
  status: 'current' | 'stale' | 'unavailable'
  scope: 'aiacopilot:operations'
  coverage: 'designated-reader'
  fallback: false
  counts?: { readableFiles: number; anchorSources: number; verifiedAnchors: number; admittedOperationsNotes: number }
  admissionRevision?: number
}
const ANCHORS = 5
const MAX_FILES = 100000
const SNAPSHOT = '/run/aia-brain/metadata.json'
export function isOpenBrainConfigured(): boolean { return true }
export async function resetOpenBrainPool(): Promise<void> { /* no pool exists */ }
export async function readOpenBrainStats(): Promise<BrainMetadata> {
  // Dynamic Node import keeps filesystem access server-only in TanStack's graph.
  const moduleName = 'node:fs/promises'
  const fs = await import(/* @vite-ignore */ moduleName)
  const handle = await fs.open(SNAPSHOT, 131072 /* O_NOFOLLOW, Linux deployment */)
  let raw: string
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > 4096) throw new Error('Invalid snapshot')
    const buffer = Buffer.alloc(4097)
    const { bytesRead } = await handle.read(buffer, 0, 4097, 0)
    if (bytesRead > 4096) throw new Error('Invalid snapshot')
    raw = buffer.subarray(0, bytesRead).toString('utf8')
  } finally { await handle.close() }
  const value = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.generatedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.generatedAt))
    throw new Error('Invalid snapshot')
  const age = Date.now() - Date.parse(value.generatedAt)
  if (value.schemaVersion !== 2 || value.scope !== 'aiacopilot:operations' ||
      value.coverage !== 'designated-reader' || value.fallback !== false ||
      !Number.isFinite(age) || age < -60000 || !['current', 'unavailable'].includes(value.status))
    throw new Error('Invalid snapshot')
  const result: BrainMetadata = { schemaVersion: 2, generatedAt: value.generatedAt,
    status: value.status === 'unavailable' ? 'unavailable' : age > 300000 ? 'stale' : 'current',
    scope: 'aiacopilot:operations', coverage: 'designated-reader', fallback: false }
  if (value.status === 'current') {
    const c = value.counts
    if (!c || c.anchorSources !== ANCHORS || c.verifiedAnchors !== ANCHORS ||
        !Number.isSafeInteger(c.readableFiles) || c.readableFiles < 1 || c.readableFiles > MAX_FILES ||
        !Number.isSafeInteger(c.admittedOperationsNotes) || c.admittedOperationsNotes < 0 || c.admittedOperationsNotes > 100 ||
        !Number.isSafeInteger(value.admissionRevision) || value.admissionRevision < 0)
      throw new Error('Invalid snapshot')
    result.counts = { readableFiles: c.readableFiles, anchorSources: ANCHORS, verifiedAnchors: ANCHORS,
      admittedOperationsNotes: c.admittedOperationsNotes }
    result.admissionRevision = value.admissionRevision
  }
  return result // allowlisted fields only, never spread snapshot input
}
