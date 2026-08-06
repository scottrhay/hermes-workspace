import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildResearchItem,
  categoryLabelFor,
  invalidateResearchIndex,
  kindFor,
  listResearchItems,
  readResearchItem,
  searchResearch,
} from './research-browser'

const STATS = { size: 1024, mtime: new Date('2026-01-15T10:00:00Z') }

function build(relativePath: string, head: string) {
  return buildResearchItem(relativePath, head, STATS)
}

describe('buildResearchItem', () => {
  describe('title', () => {
    it('prefers YAML frontmatter title', () => {
      const item = build(
        'mc-export/2025-12-15-makecom-platform-analysis.md',
        [
          '---',
          'title: "Make.com Platform Analysis and Competitive Positioning"',
          'date: 2025-12-15',
          '---',
          '',
          '# Something Else',
        ].join('\n'),
      )
      expect(item.title).toBe(
        'Make.com Platform Analysis and Competitive Positioning',
      )
    })

    it('falls back to the first heading', () => {
      const item = build(
        'youtube-transcripts/2026-07-23-sL5hPovH1vU-analysis.md',
        '# Detailed Extraction — 1000+ Hours of Learning Claude in 15 Minutes\n',
      )
      expect(item.title).toBe(
        'Detailed Extraction — 1000+ Hours of Learning Claude in 15 Minutes',
      )
    })

    it('accepts an h2 as the leading heading', () => {
      const item = build('x-news/2026-06-20/daily-brief.md', '## Daily X News Brief\n')
      expect(item.title).toBe('Daily X News Brief')
    })

    it('humanizes the filename when there is no heading, dropping the date prefix', () => {
      const item = build(
        'articles/2026-05-10-futurebrief-5-rules-ai-agent-data.md',
        'Some prose with no heading at all.\n',
      )
      expect(item.title).toBe('Futurebrief 5 Rules Ai Agent Data')
    })
  })

  describe('date', () => {
    it('reads frontmatter date first', () => {
      const item = build(
        'mc-export/whatever.md',
        '---\ndate: 2025-12-15\n---\n\n# Title\n',
      )
      expect(item.date).toBe('2025-12-15')
    })

    it('reads a date embedded anywhere in the filename', () => {
      const item = build(
        'daily-briefings/2026-08-02/aia-daily-research-brief-2026-08-02.md',
        '# Brief\n',
      )
      expect(item.date).toBe('2026-08-02')
    })

    it('falls back to a date-named parent folder', () => {
      const item = build('x-news/2026-06-20/daily-brief.md', '## Brief\n')
      expect(item.date).toBe('2026-06-20')
    })

    it('falls back to file mtime when nothing else is available', () => {
      const item = build('competitive/notes.md', '# Notes\n')
      expect(item.date).toBe('2026-01-15')
    })
  })

  describe('category and kind', () => {
    it('uses the top-level folder as the category', () => {
      const item = build('workflow-radar/2026-08-01/weekly-radar-input.md', '# R\n')
      expect(item.category).toBe('workflow-radar')
      expect(item.categoryLabel).toBe('Workflow Radar')
    })

    it('classifies automation folders as feeds', () => {
      expect(kindFor('x-news')).toBe('feed')
      expect(kindFor('revenue-signal')).toBe('feed')
      expect(kindFor('viral-swipe-file')).toBe('feed')
    })

    it('classifies analysis folders as curated', () => {
      expect(kindFor('articles')).toBe('curated')
      expect(kindFor('youtube-transcripts')).toBe('curated')
      expect(kindFor('daily-briefings')).toBe('curated')
    })

    it('files at the root belong to the Library category', () => {
      const item = build('RESEARCH-PLAYBOOK.md', '# Research Playbook\n')
      expect(item.category).toBe('_library')
      expect(item.categoryLabel).toBe('Library')
      expect(item.kind).toBe('curated')
    })

    it('applies label overrides', () => {
      expect(categoryLabelFor('mc-export')).toBe('Mission Control Export')
      expect(categoryLabelFor('youtube-transcripts')).toBe('YouTube Transcripts')
    })
  })

  describe('summary', () => {
    it('skips the header block and takes the first real paragraph', () => {
      const item = build(
        'articles/2026-05-10-futurebrief.md',
        [
          '# 5 rules before AI agent touches your data.',
          '',
          'Source: https://open.substack.com/pub/futurebriefai/p/5-rules',
          'Published: 2026-05-01',
          'Publisher: FutureBrief / Yuri Vonchitzki',
          '',
          '## Article text',
          '',
          'Last week, a founder told me they had their new autonomous agent',
          'working flawlessly in staging.',
        ].join('\n'),
      )
      expect(item.summary).toBe(
        'Last week, a founder told me they had their new autonomous agent working flawlessly in staging.',
      )
    })

    it('skips blockquote evidence boundaries and bold metadata lines', () => {
      const item = build(
        'youtube-transcripts/a.md',
        [
          '# Detailed Extraction',
          '',
          '**Source:** https://youtu.be/sL5hPovH1vU  ',
          '**Speaker:** Dan Martell  ',
          '',
          '> Evidence boundary: this document faithfully extracts the framework.',
          '',
          '## Executive summary',
          '',
          'Dan presents a six-level Claude maturity ladder.',
        ].join('\n'),
      )
      expect(item.summary).toBe(
        'Dan presents a six-level Claude maturity ladder.',
      )
    })

    it('truncates long summaries at a word boundary', () => {
      const item = build(
        'articles/long.md',
        `# Title\n\n${'word '.repeat(200)}`,
      )
      expect(item.summary!.length).toBeLessThanOrEqual(241)
      expect(item.summary!.endsWith('…')).toBe(true)
    })
  })

  describe('source', () => {
    it('prefers a labelled source line and classifies YouTube', () => {
      const item = build(
        'youtube-transcripts/a.md',
        [
          '# Extraction',
          '',
          '**Source:** https://youtu.be/sL5hPovH1vU  ',
          '**Raw artifact:** /mnt/aiacopilot/Research-Strategy/x.json',
        ].join('\n'),
      )
      expect(item.sourceUrl).toBe('https://youtu.be/sL5hPovH1vU')
      expect(item.sourceType).toBe('youtube')
    })

    it('classifies x.com links', () => {
      const item = build(
        'x-news/2026-06-20/daily-brief.md',
        '## Brief\n\n- @POTUS: something — https://x.com/POTUS/status/2076769179651195342\n',
      )
      expect(item.sourceType).toBe('x')
    })

    it('classifies substack, linkedin, medium and generic web', () => {
      expect(
        build('a/b.md', '# T\n\nSource: https://open.substack.com/pub/x/p/y\n')
          .sourceType,
      ).toBe('substack')
      expect(
        build('a/b.md', '# T\n\nSource: https://www.linkedin.com/posts/x\n')
          .sourceType,
      ).toBe('linkedin')
      expect(
        build('a/b.md', '# T\n\nSource: https://medium.com/@a/b\n').sourceType,
      ).toBe('medium')
      expect(
        build('a/b.md', '# T\n\nSource: https://anthropic.com/news\n').sourceType,
      ).toBe('web')
    })

    it('reports internal when no URL is present', () => {
      const item = build('competitive/a.md', '# Reconstruction\n\nNo links here.\n')
      expect(item.sourceUrl).toBeUndefined()
      expect(item.sourceType).toBe('internal')
    })

    it('strips trailing punctuation from URLs', () => {
      const item = build(
        'a/b.md',
        '# T\n\nSource: https://example.com/a.\n',
      )
      expect(item.sourceUrl).toBe('https://example.com/a')
    })
  })

  describe('output contract fields', () => {
    it('reads Decision and Evidence verdicts', () => {
      const item = build(
        'articles/a.md',
        [
          '## Research Item: Something',
          '',
          'Decision: ADOPT NOW',
          'Evidence: strong',
        ].join('\n'),
      )
      expect(item.decision).toBe('ADOPT NOW')
      expect(item.evidence).toBe('strong')
    })

    it('reads bold-wrapped verdicts case-insensitively', () => {
      const item = build(
        'articles/a.md',
        '# T\n\n**Decision:** test next\n**Evidence:** Moderate\n',
      )
      expect(item.decision).toBe('TEST NEXT')
      expect(item.evidence).toBe('moderate')
    })

    it('ignores the template line that lists every option', () => {
      const item = build(
        'AIA-RESEARCH-ARCHITECTURE-v1.md',
        [
          '## Output Contract',
          '',
          'Decision: ADOPT NOW | TEST NEXT | MONITOR | REFERENCE ONLY | REJECT',
          'Evidence: strong | moderate | weak',
        ].join('\n'),
      )
      expect(item.decision).toBeUndefined()
      expect(item.evidence).toBeUndefined()
    })

    it('ignores "Evidence boundary:" prose', () => {
      const item = build(
        'articles/a.md',
        '# T\n\nEvidence boundary: claims are speaker claims, not verified.\n',
      )
      expect(item.evidence).toBeUndefined()
    })

    it('ignores Evidence inside a bullet list row', () => {
      const item = build(
        'workflow-radar/2026-08-02/weekly-radar-input.md',
        '# Radar\n\n- Revenue potential: high | Complexity: unknown | Evidence: weak\n',
      )
      expect(item.evidence).toBeUndefined()
    })
  })

  it('reads frontmatter tags as a list', () => {
    const item = build(
      'mc-export/a.md',
      '---\ntitle: X\ntags: ["make.com", "automation"]\n---\n\n# X\n',
    )
    expect(item.tags).toEqual(['make.com', 'automation'])
  })
})

describe('filesystem-backed operations', () => {
  let root: string
  let stateDir: string
  const originalResearchDir = process.env.RESEARCH_DIR
  const originalStateDir = process.env.HERMES_WORKSPACE_STATE_DIR

  beforeEach(() => {
    invalidateResearchIndex()
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'research-root-'))
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'research-state-'))
    process.env.RESEARCH_DIR = root
    process.env.HERMES_WORKSPACE_STATE_DIR = stateDir

    fs.mkdirSync(path.join(root, 'articles'), { recursive: true })
    fs.mkdirSync(path.join(root, 'x-news', '2026-06-20'), { recursive: true })
    fs.mkdirSync(path.join(root, '.obsidian'), { recursive: true })

    fs.writeFileSync(
      path.join(root, 'articles', '2026-05-10-agent-guardrails.md'),
      '# Five rules before an AI agent touches your data\n\nSource: https://example.com/a\n\nStructured automation is the spine.\n',
    )
    fs.writeFileSync(
      path.join(root, 'x-news', '2026-06-20', 'daily-brief.md'),
      '## Daily X News Brief\n\nItems processed: 250 unique posts.\n',
    )
    fs.writeFileSync(path.join(root, 'README.md'), '# Research Library\n')
    fs.writeFileSync(path.join(root, '.obsidian', 'app.md'), '# Ignored\n')
    fs.writeFileSync(path.join(root, 'articles', 'notes.txt'), 'ignored')
  })

  afterEach(() => {
    invalidateResearchIndex()
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(stateDir, { recursive: true, force: true })
    if (originalResearchDir === undefined) delete process.env.RESEARCH_DIR
    else process.env.RESEARCH_DIR = originalResearchDir
    if (originalStateDir === undefined) {
      delete process.env.HERMES_WORKSPACE_STATE_DIR
    } else {
      process.env.HERMES_WORKSPACE_STATE_DIR = originalStateDir
    }
  })

  it('indexes markdown files, skipping ignored folders and non-markdown', () => {
    const index = listResearchItems()
    expect(index.exists).toBe(true)
    expect(index.items.map((item) => item.path).sort()).toEqual([
      'README.md',
      'articles/2026-05-10-agent-guardrails.md',
      'x-news/2026-06-20/daily-brief.md',
    ])
  })

  it('separates feed items from curated items in the facets', () => {
    const { facets } = listResearchItems()
    const byId = new Map(facets.categories.map((c) => [c.id, c]))
    expect(byId.get('articles')?.kind).toBe('curated')
    expect(byId.get('x-news')?.kind).toBe('feed')
    expect(byId.get('_library')?.kind).toBe('curated')
  })

  it('sorts items newest first', () => {
    const dates = listResearchItems().items.map((item) => item.date)
    expect(dates).toEqual([...dates].sort().reverse())
    // README.md carries no date of its own, so it dates from its mtime (today)
    // and outranks the dated fixtures.
    expect(dates.slice(1)).toEqual(['2026-06-20', '2026-05-10'])
  })

  it('serves unchanged files from cache on the second pass', () => {
    // Pin the timestamp first: utimes has millisecond precision while the
    // cache key uses mtimeMs, so a freshly written file would not compare
    // equal to itself after a restore.
    const target = path.join(root, 'articles', '2026-05-10-agent-guardrails.md')
    const pinned = new Date('2026-05-10T12:00:00.000Z')
    fs.utimesSync(target, pinned, pinned)

    listResearchItems()
    const cachePath = path.join(stateDir, 'research-index.json')
    expect(fs.existsSync(cachePath)).toBe(true)

    // Corrupt the file on disk without changing mtime or size: a cached read
    // returns the original title, proving the file was not re-parsed.
    const original = fs.readFileSync(target, 'utf-8')
    fs.writeFileSync(target, original.replace('Five rules', 'XXXX XXXXX'))
    fs.utimesSync(target, pinned, pinned)

    const item = listResearchItems({ refresh: true }).items.find(
      (entry) => entry.path === 'articles/2026-05-10-agent-guardrails.md',
    )
    expect(item?.title).toBe(
      'Five rules before an AI agent touches your data',
    )
  })

  it('re-parses a file when its mtime changes', () => {
    listResearchItems()
    const target = path.join(root, 'articles', '2026-05-10-agent-guardrails.md')
    fs.writeFileSync(target, '# Rewritten title\n')
    fs.utimesSync(target, new Date(), new Date(Date.now() + 5000))

    const item = listResearchItems({ refresh: true }).items.find(
      (entry) => entry.path === 'articles/2026-05-10-agent-guardrails.md',
    )
    expect(item?.title).toBe('Rewritten title')
  })

  it('serves a repeated call from the in-memory memo', () => {
    listResearchItems()
    fs.writeFileSync(path.join(root, 'articles', 'brand-new.md'), '# New\n')
    expect(listResearchItems().items).toHaveLength(3)
    expect(listResearchItems({ refresh: true }).items).toHaveLength(4)
  })

  it('reads a single item with its full content', () => {
    const { item, content } = readResearchItem(
      'articles/2026-05-10-agent-guardrails.md',
    )
    expect(item.title).toBe('Five rules before an AI agent touches your data')
    expect(content).toContain('Structured automation is the spine.')
  })

  describe('path safety', () => {
    it('rejects traversal segments', () => {
      expect(() => readResearchItem('../../secrets.md')).toThrow(/traversal/i)
      expect(() => readResearchItem('articles/../../secrets.md')).toThrow(
        /traversal/i,
      )
    })

    it('rejects absolute paths', () => {
      expect(() => readResearchItem('/etc/passwd.md')).toThrow(/Absolute/i)
    })

    it('rejects non-markdown files', () => {
      expect(() => readResearchItem('articles/notes.txt')).toThrow(/Markdown/i)
    })

    it('rejects an empty path', () => {
      expect(() => readResearchItem('')).toThrow(/required/i)
    })

    it('rejects backslash traversal', () => {
      expect(() => readResearchItem('articles\\..\\..\\secrets.md')).toThrow(
        /traversal/i,
      )
    })
  })

  describe('search', () => {
    it('finds body matches case-insensitively', () => {
      const results = searchResearch('structured automation')
      expect(results).toHaveLength(1)
      expect(results[0].path).toBe('articles/2026-05-10-agent-guardrails.md')
      expect(results[0].text).toContain('Structured automation is the spine.')
    })

    it('scopes results to a kind', () => {
      expect(searchResearch('brief', { kind: 'feed' })).toHaveLength(1)
      expect(searchResearch('brief', { kind: 'curated' })).toHaveLength(0)
    })

    it('returns nothing for an empty query', () => {
      expect(searchResearch('   ')).toEqual([])
    })

    it('treats the query as a literal, not a regex', () => {
      expect(() => searchResearch('a(b')).not.toThrow()
      expect(searchResearch('a(b')).toEqual([])
    })
  })

  it('reports a missing root without throwing', () => {
    process.env.RESEARCH_DIR = path.join(root, 'does-not-exist')
    const index = listResearchItems()
    expect(index.exists).toBe(false)
    expect(index.items).toEqual([])
  })
})
