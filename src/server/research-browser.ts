import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { getStateDir } from './workspace-state-dir'

/**
 * Research library browser.
 *
 * Indexes Scott's Research-Strategy folder (markdown only) into review-ready
 * cards. The corpus has no consistent frontmatter, so metadata is derived
 * heuristically from the shapes actually used in the library:
 *   - YAML frontmatter (mc-export)
 *   - `# Title` + `**Source:** …` / `Published: …` header blocks (most files)
 *   - date-named parent folders (x-news/2026-06-20/…)
 *
 * Indexing reads only the head of each file; full content is read on open.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResearchKind = 'curated' | 'feed'

export type ResearchDecision =
  | 'ADOPT NOW'
  | 'TEST NEXT'
  | 'MONITOR'
  | 'REFERENCE ONLY'
  | 'REJECT'

export type ResearchEvidence = 'strong' | 'moderate' | 'weak'

export type ResearchSourceType =
  | 'youtube'
  | 'x'
  | 'linkedin'
  | 'medium'
  | 'substack'
  | 'web'
  | 'internal'

export type ResearchItem = {
  path: string
  name: string
  title: string
  category: string
  categoryLabel: string
  kind: ResearchKind
  date: string
  summary?: string
  sourceUrl?: string
  sourceType: ResearchSourceType
  decision?: ResearchDecision
  evidence?: ResearchEvidence
  tags: Array<string>
  size: number
  modified: string
}

export type ResearchFacets = {
  categories: Array<{
    id: string
    label: string
    kind: ResearchKind
    count: number
  }>
  sourceTypes: Array<{ id: ResearchSourceType; count: number }>
  decisions: Array<{ id: ResearchDecision; count: number }>
}

export type ResearchIndex = {
  items: Array<ResearchItem>
  facets: ResearchFacets
  root: string
  exists: boolean
}

// ─── Root resolution ──────────────────────────────────────────────────────────

const RESEARCH_SUBPATH = ['Documents', 'AIWork', 'Research-Strategy']

const NON_USER_PROFILES = new Set([
  'Public',
  'Default',
  'Default User',
  'All Users',
])

/**
 * Every `Documents/AIWork/Research-Strategy` under a `OneDrive…` folder in the
 * given home directory. Scott has several tenants' OneDrives side by side.
 */
function oneDriveCandidates(homeDir: string): Array<string> {
  try {
    return fs
      .readdirSync(homeDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('OneDrive'))
      .map((entry) => path.join(homeDir, entry.name, ...RESEARCH_SUBPATH))
  } catch {
    return []
  }
}

/**
 * The workspace usually runs under WSL, where `os.homedir()` is the Linux home
 * rather than the Windows profile holding OneDrive. Probe the mounted Windows
 * profiles so the library resolves without configuration from either runtime.
 */
function windowsProfilesFromWsl(): Array<string> {
  const usersDir = '/mnt/c/Users'
  try {
    return fs
      .readdirSync(usersDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !NON_USER_PROFILES.has(entry.name))
      .map((entry) => path.join(usersDir, entry.name))
  } catch {
    return []
  }
}

let defaultRootMemo: string | null = null

function resolveDefaultResearchRoot(): string {
  if (defaultRootMemo) return defaultRootMemo

  const candidates = [
    ...oneDriveCandidates(os.homedir()),
    ...windowsProfilesFromWsl().flatMap(oneDriveCandidates),
  ]

  const found = candidates.find((candidate) => fs.existsSync(candidate))
  // With nothing on disk, fall back to the conventional location so the empty
  // state can name a concrete path.
  defaultRootMemo =
    found ||
    candidates[0] ||
    path.join(os.homedir(), 'OneDrive', ...RESEARCH_SUBPATH)
  return defaultRootMemo
}

export function getResearchRoot(): string {
  const configured = process.env.RESEARCH_DIR?.trim()
  if (configured) {
    return path.resolve(
      configured.replace(/^~[/\\]/, `${os.homedir()}${path.sep}`),
    )
  }
  return resolveDefaultResearchRoot()
}

export function researchRootExists(): boolean {
  try {
    return fs.existsSync(getResearchRoot())
  } catch {
    return false
  }
}

// ─── Folder classification ────────────────────────────────────────────────────

/**
 * Folders whose contents are generated daily by automation. They outnumber the
 * curated analyses ~3:1, so they get their own tab rather than drowning the
 * default view.
 */
const FEED_CATEGORIES = new Set([
  'x-news',
  'x-bookmarks',
  'workflow-radar',
  'revenue-signal',
  'viral-swipe-file',
])

/** Root-level markdown files (README, playbooks, architecture docs). */
const LIBRARY_CATEGORY = '_library'

const SKIP_DIRECTORIES = new Set([
  '.git',
  '.obsidian',
  'node_modules',
  'scripts',
  '_state',
])

const CATEGORY_LABEL_OVERRIDES: Record<string, string> = {
  [LIBRARY_CATEGORY]: 'Library',
  'mc-export': 'Mission Control Export',
  'oe-0202d678': 'OpenEngine Task',
  'x-news': 'X News',
  'x-bookmarks': 'X Bookmarks',
  'youtube-transcripts': 'YouTube Transcripts',
}

function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function categoryLabelFor(category: string): string {
  return CATEGORY_LABEL_OVERRIDES[category] || humanizeSlug(category)
}

export function kindFor(category: string): ResearchKind {
  return FEED_CATEGORIES.has(category) ? 'feed' : 'curated'
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

type FrontmatterData = {
  title?: string
  date?: string
  summary?: string
  tags?: unknown
  source?: string
}

function parseFrontmatter(head: string): {
  data: FrontmatterData
  body: string
} {
  if (!head.startsWith('---')) return { data: {}, body: head }

  const match = head.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { data: {}, body: head }

  try {
    const parsed = YAML.parse(match[1])
    return {
      data:
        parsed && typeof parsed === 'object' ? (parsed as FrontmatterData) : {},
      body: match[2] || '',
    }
  } catch {
    return { data: {}, body: match[2] || head }
  }
}

function normalizeTagList(input: unknown): Array<string> {
  if (Array.isArray(input)) {
    return input.map((value) => String(value).trim()).filter(Boolean)
  }
  if (typeof input === 'string') {
    return input
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }
  return []
}

const DATE_PATTERN = /(\d{4}-\d{2}-\d{2})/
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function normalizeDate(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  if (!text) return null
  const match = text.match(DATE_PATTERN)
  if (!match) return null
  const candidate = match[1]
  const parsed = Date.parse(`${candidate}T00:00:00Z`)
  return Number.isNaN(parsed) ? null : candidate
}

/**
 * Resolve the item date. Frontmatter wins, then a date in the filename, then a
 * date-named parent folder, then the file mtime.
 */
function resolveDate(
  frontmatterDate: unknown,
  relativePath: string,
  mtime: Date,
): string {
  const fromFrontmatter = normalizeDate(frontmatterDate)
  if (fromFrontmatter) return fromFrontmatter

  const segments = relativePath.split('/')
  const fileName = segments[segments.length - 1] || ''
  const fromFileName = normalizeDate(fileName)
  if (fromFileName) return fromFileName

  for (let index = segments.length - 2; index >= 0; index -= 1) {
    const segment = segments[index] || ''
    if (DATE_ONLY_PATTERN.test(segment)) return segment
  }

  return mtime.toISOString().slice(0, 10)
}

/** First heading of any level, e.g. `# Title` or `## Daily X News Brief`. */
function extractHeading(body: string): string | null {
  const match = body.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/m)
  if (!match) return null
  const title = match[1].replace(/[*_`]/g, '').trim()
  return title || null
}

function titleFromFileName(name: string): string {
  const withoutExtension = name.replace(/\.md$/i, '')
  const withoutDate = withoutExtension.replace(/^\d{4}-\d{2}-\d{2}[-_]?/, '')
  return humanizeSlug(withoutDate || withoutExtension)
}

/**
 * Lines that belong to a header block rather than prose: `**Source:** …`,
 * `Published: 2026-05-01`, blockquote evidence boundaries, rules, images.
 */
function isMetadataLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (/^#{1,6}\s/.test(trimmed)) return true
  if (/^[>|]/.test(trimmed)) return true
  if (/^([-*_])\1{2,}$/.test(trimmed.replace(/\s/g, ''))) return true
  if (/^!\[/.test(trimmed)) return true
  if (/^\|/.test(trimmed)) return true
  // `**Key:** value` or `Key: value` where the key is a short label.
  if (/^\*{0,2}[A-Za-z][A-Za-z0-9 /'’-]{0,28}\*{0,2}\s*:\s*/.test(trimmed)) {
    return true
  }
  return false
}

const SUMMARY_MAX_LENGTH = 240

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text
  const clipped = text.slice(0, max)
  const lastSpace = clipped.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`
}

function extractSummary(body: string): string | undefined {
  const lines = body.split(/\r?\n/)
  const paragraph: Array<string> = []

  for (const line of lines) {
    if (paragraph.length === 0) {
      if (isMetadataLine(line)) continue
      paragraph.push(line.trim())
      continue
    }
    if (!line.trim()) break
    if (/^#{1,6}\s/.test(line.trim())) break
    paragraph.push(line.trim())
  }

  if (paragraph.length === 0) return undefined

  const text = paragraph
    .join(' ')
    .replace(/^[-*]\s+/, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return text ? truncateAtWord(text, SUMMARY_MAX_LENGTH) : undefined
}

// Excludes markdown/citation punctuation so `[…](url)` and `` `url`.[1] ``
// yield a bare URL.
const URL_PATTERN = /https?:\/\/[^\s)>\]["'`]+/

/** Look for the source URL in the header block only, not deep in the body. */
function extractSourceUrl(body: string): string | undefined {
  const lines = body.split(/\r?\n/).slice(0, 30)

  const labelled = lines.find((line) =>
    /^\s*\*{0,2}(source|url|link|full source)\*{0,2}\s*:/i.test(line),
  )
  const labelledMatch = labelled?.match(URL_PATTERN)
  if (labelledMatch) return labelledMatch[0].replace(/[.,;]+$/, '')

  for (const line of lines) {
    const match = line.match(URL_PATTERN)
    if (match) return match[0].replace(/[.,;]+$/, '')
  }
  return undefined
}

function classifySourceUrl(url: string | undefined): ResearchSourceType {
  if (!url) return 'internal'
  const lower = url.toLowerCase()
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    return 'youtube'
  }
  if (/(^|\/\/|\.)(x\.com|twitter\.com)/.test(lower)) return 'x'
  if (lower.includes('linkedin.com')) return 'linkedin'
  if (lower.includes('medium.com')) return 'medium'
  if (lower.includes('substack.com')) return 'substack'
  return 'web'
}

const DECISION_VALUES: Array<ResearchDecision> = [
  'ADOPT NOW',
  'TEST NEXT',
  'MONITOR',
  'REFERENCE ONLY',
  'REJECT',
]

const EVIDENCE_VALUES: Array<ResearchEvidence> = ['strong', 'moderate', 'weak']

/**
 * Read a `Label: value` line from the research output contract. Lines listing
 * every option (`Decision: ADOPT NOW | TEST NEXT | …`) are template text in the
 * playbook docs, not a real verdict, so they are ignored.
 */
function extractContractField<T extends string>(
  body: string,
  label: string,
  allowed: Array<T>,
): T | undefined {
  const pattern = new RegExp(`^\\s*\\*{0,2}${label}\\*{0,2}\\s*:\\s*(.+)$`, 'im')
  const match = body.match(pattern)
  if (!match) return undefined

  const rest = match[1].trim()
  if (rest.includes('|')) return undefined

  const value = rest.replace(/[*_`]/g, '').trim()
  return allowed.find((option) => option.toLowerCase() === value.toLowerCase())
}

// ─── Item construction ────────────────────────────────────────────────────────

const HEAD_BYTES = 8192

function readHead(fullPath: string, size: number): string {
  const length = Math.min(size, HEAD_BYTES)
  if (length <= 0) return ''
  const buffer = Buffer.alloc(length)
  const handle = fs.openSync(fullPath, 'r')
  try {
    const bytesRead = fs.readSync(handle, buffer, 0, length, 0)
    return buffer.subarray(0, bytesRead).toString('utf-8')
  } finally {
    fs.closeSync(handle)
  }
}

export function buildResearchItem(
  relativePath: string,
  head: string,
  stats: { size: number; mtime: Date },
): ResearchItem {
  const { data, body } = parseFrontmatter(head)
  const segments = relativePath.split('/').filter(Boolean)
  const name = segments[segments.length - 1] || relativePath
  const category = segments.length > 1 ? segments[0] : LIBRARY_CATEGORY

  const title =
    (typeof data.title === 'string' && data.title.trim()) ||
    extractHeading(body) ||
    titleFromFileName(name)

  const sourceUrl =
    (typeof data.source === 'string' && URL_PATTERN.test(data.source)
      ? data.source.trim()
      : undefined) || extractSourceUrl(body)

  return {
    path: relativePath,
    name,
    title,
    category,
    categoryLabel: categoryLabelFor(category),
    kind: kindFor(category),
    date: resolveDate(data.date, relativePath, stats.mtime),
    summary:
      (typeof data.summary === 'string' && data.summary.trim()) ||
      extractSummary(body),
    sourceUrl,
    sourceType: classifySourceUrl(sourceUrl),
    decision: extractContractField(body, 'Decision', DECISION_VALUES),
    evidence: extractContractField(body, 'Evidence', EVIDENCE_VALUES),
    tags: normalizeTagList(data.tags),
    size: stats.size,
    modified: stats.mtime.toISOString(),
  }
}

// ─── Index cache ──────────────────────────────────────────────────────────────

type CacheEntry = {
  mtimeMs: number
  size: number
  item: ResearchItem
}

type CacheFile = {
  version: number
  root: string
  entries: Record<string, CacheEntry>
}

/**
 * Bump whenever the parser changes. Entries are keyed on mtime+size, so an
 * unchanged file would otherwise keep serving metadata from the old parser.
 */
const CACHE_VERSION = 2

function getCachePath(): string {
  return path.join(getStateDir(), 'research-index.json')
}

function readCache(root: string): Map<string, CacheEntry> {
  try {
    const raw = fs.readFileSync(getCachePath(), 'utf-8')
    const parsed = JSON.parse(raw) as CacheFile
    if (parsed.version !== CACHE_VERSION || parsed.root !== root) {
      return new Map()
    }
    return new Map(Object.entries(parsed.entries || {}))
  } catch {
    return new Map()
  }
}

function writeCache(root: string, entries: Map<string, CacheEntry>): void {
  try {
    const cachePath = getCachePath()
    fs.mkdirSync(path.dirname(cachePath), { recursive: true })
    const payload: CacheFile = {
      version: CACHE_VERSION,
      root,
      entries: Object.fromEntries(entries),
    }
    fs.writeFileSync(cachePath, JSON.stringify(payload), 'utf-8')
  } catch {
    // A cold index is slower but still correct — never fail the request.
  }
}

// ─── Path safety ──────────────────────────────────────────────────────────────

function resolveResearchFilePath(relativePath: string): {
  fullPath: string
  relativePath: string
} {
  const normalized = relativePath.replace(/\\/g, '/').trim()
  if (!normalized) throw new Error('Path is required')
  if (normalized.startsWith('/')) {
    throw new Error('Absolute paths are not allowed')
  }
  if (normalized.split('/').includes('..')) {
    throw new Error('Path traversal is not allowed')
  }
  if (!normalized.toLowerCase().endsWith('.md')) {
    throw new Error('Only Markdown files are allowed')
  }

  const root = path.resolve(getResearchRoot())
  const fullPath = path.resolve(root, normalized)
  const relativeFromRoot = path.relative(root, fullPath)
  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
    throw new Error('Resolved path is outside the research root')
  }
  return { fullPath, relativePath: normalized }
}

// ─── Walking ──────────────────────────────────────────────────────────────────

function walk(root: string, dirPath: string, results: Array<string>): void {
  let entries: Array<fs.Dirent>
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue
      walk(root, fullPath, results)
      continue
    }
    if (!entry.isFile()) continue
    if (!entry.name.toLowerCase().endsWith('.md')) continue

    const relativePath = path.relative(root, fullPath).replace(/\\/g, '/')
    if (!relativePath || relativePath.startsWith('..')) continue
    results.push(relativePath)
  }
}

// ─── Facets ───────────────────────────────────────────────────────────────────

function buildFacets(items: Array<ResearchItem>): ResearchFacets {
  const categories = new Map<string, { label: string; kind: ResearchKind; count: number }>()
  const sourceTypes = new Map<ResearchSourceType, number>()
  const decisions = new Map<ResearchDecision, number>()

  for (const item of items) {
    const category = categories.get(item.category)
    if (category) {
      category.count += 1
    } else {
      categories.set(item.category, {
        label: item.categoryLabel,
        kind: item.kind,
        count: 1,
      })
    }

    sourceTypes.set(item.sourceType, (sourceTypes.get(item.sourceType) || 0) + 1)
    if (item.decision) {
      decisions.set(item.decision, (decisions.get(item.decision) || 0) + 1)
    }
  }

  return {
    categories: Array.from(categories.entries())
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    sourceTypes: Array.from(sourceTypes.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count),
    decisions: DECISION_VALUES.filter((id) => decisions.has(id)).map((id) => ({
      id,
      count: decisions.get(id) || 0,
    })),
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Re-walking the tree costs one stat() per file, which is slow when the
 * library lives on OneDrive (and slower still through WSL's drvfs mount).
 * Hold the result briefly so the screen's list/search/read calls don't each
 * pay for it.
 */
const MEMO_TTL_MS = 60_000
let memo: { at: number; root: string; index: ResearchIndex } | null = null

export function invalidateResearchIndex(): void {
  memo = null
}

/**
 * Build (or refresh) the research index. Files whose mtime and size are
 * unchanged since the last run are served from cache rather than re-parsed.
 */
export function listResearchItems(
  options: { refresh?: boolean } = {},
): ResearchIndex {
  const root = path.resolve(getResearchRoot())

  if (!options.refresh && memo && memo.root === root) {
    if (Date.now() - memo.at < MEMO_TTL_MS) return memo.index
  }
  if (!fs.existsSync(root)) {
    const empty: ResearchIndex = {
      items: [],
      facets: { categories: [], sourceTypes: [], decisions: [] },
      root,
      exists: false,
    }
    memo = { at: Date.now(), root, index: empty }
    return empty
  }

  const relativePaths: Array<string> = []
  walk(root, root, relativePaths)

  const cache = readCache(root)
  const next = new Map<string, CacheEntry>()
  const items: Array<ResearchItem> = []
  let changed = false

  for (const relativePath of relativePaths) {
    const fullPath = path.join(root, relativePath)
    let stats: fs.Stats
    try {
      stats = fs.statSync(fullPath)
    } catch {
      continue
    }

    const cached = cache.get(relativePath)
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
      next.set(relativePath, cached)
      items.push(cached.item)
      continue
    }

    let item: ResearchItem
    try {
      item = buildResearchItem(relativePath, readHead(fullPath, stats.size), {
        size: stats.size,
        mtime: stats.mtime,
      })
    } catch {
      continue
    }

    changed = true
    next.set(relativePath, { mtimeMs: stats.mtimeMs, size: stats.size, item })
    items.push(item)
  }

  if (changed || next.size !== cache.size) {
    writeCache(root, next)
  }

  items.sort(
    (a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title),
  )

  const index: ResearchIndex = {
    items,
    facets: buildFacets(items),
    root,
    exists: true,
  }
  memo = { at: Date.now(), root, index }
  return index
}

export function readResearchItem(relativePath: string): {
  item: ResearchItem
  content: string
} {
  const { fullPath, relativePath: safePath } =
    resolveResearchFilePath(relativePath)

  const stats = fs.statSync(fullPath)
  if (!stats.isFile()) {
    throw new Error(`Not a file: ${safePath}`)
  }

  const raw = fs.readFileSync(fullPath, 'utf-8')
  const item = buildResearchItem(safePath, raw.slice(0, HEAD_BYTES), {
    size: stats.size,
    mtime: stats.mtime,
  })
  const { body } = parseFrontmatter(raw)

  return { item, content: body }
}

export type ResearchSearchHit = {
  path: string
  title: string
  category: string
  categoryLabel: string
  kind: ResearchKind
  date: string
  line: number
  text: string
}

const SEARCH_HIT_LIMIT = 200

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Full-text search across the corpus. Title matches are reported without
 * opening the file; body matches stream through each file once.
 */
export function searchResearch(
  query: string,
  options: { kind?: ResearchKind } = {},
): Array<ResearchSearchHit> {
  const needle = query.trim()
  if (!needle) return []

  const root = path.resolve(getResearchRoot())
  const { items } = listResearchItems()
  const scoped = options.kind
    ? items.filter((item) => item.kind === options.kind)
    : items

  const regex = new RegExp(escapeRegex(needle), 'i')
  const hits: Array<ResearchSearchHit> = []

  for (const item of scoped) {
    let raw: string
    try {
      raw = fs.readFileSync(path.join(root, item.path), 'utf-8')
    } catch {
      continue
    }

    const lines = raw.split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index] || ''
      if (!regex.test(text)) continue
      hits.push({
        path: item.path,
        title: item.title,
        category: item.category,
        categoryLabel: item.categoryLabel,
        kind: item.kind,
        date: item.date,
        line: index + 1,
        text: text.trim().slice(0, 300),
      })
      break
    }

    if (hits.length >= SEARCH_HIT_LIMIT) break
  }

  return hits
}
