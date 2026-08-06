/** Mirrors the payloads served by `/api/research/*`. */

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

export type ResearchListResponse = {
  items?: Array<ResearchItem>
  facets?: ResearchFacets
  root?: string
  exists?: boolean
}

export type ResearchReadResponse = {
  item?: ResearchItem
  content?: string
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

export type ResearchSearchResponse = {
  results?: Array<ResearchSearchHit>
}
