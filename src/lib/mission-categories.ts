/**
 * mission-categories.ts
 *
 * Pure, deterministic classification module for AIA Mission Control.
 * Classifies Telegram workstreams into "Marketing" or "Training" categories
 * based on title/groupName keyword matching only.
 *
 * Rules:
 * - Matches only against title and groupName (case-insensitive)
 * - Never matches against message bodies
 * - An item can match BOTH categories
 * - An item matching neither appears in neither
 * - Assignments are never persisted
 */

export const MARKETING_KEYWORDS: readonly string[] = [
  'marketing',
  'campaign',
  'advertising',
  'ad copy',
  'copywriting',
  'content creation',
  'social media',
  'promo',
  'promotion',
  'launch',
  'newsletter',
  'outreach',
  'branding',
  'funnel',
  'email blast',
  'growth hacking',
  'viral',
  'audience building',
];

export const TRAINING_KEYWORDS: readonly string[] = [
  'training',
  'course',
  'lesson',
  'tutorial',
  'workshop',
  'coaching',
  'curriculum',
  'bootcamp',
  'certification',
  'e-learning',
  'elearning',
  'instruction',
  'teach',
  'study',
  'learning program',
  'module',
  'skill building',
];

function matchesKeywords(
  workstream: { title: string; groupName: string },
  keywords: readonly string[]
): boolean {
  const titleLower = workstream.title.toLowerCase();
  const groupNameLower = workstream.groupName.toLowerCase();
  return keywords.some(
    (keyword) => titleLower.includes(keyword) || groupNameLower.includes(keyword)
  );
}

export function isMarketing(workstream: { title: string; groupName: string }): boolean {
  return matchesKeywords(workstream, MARKETING_KEYWORDS);
}

export function isTraining(workstream: { title: string; groupName: string }): boolean {
  return matchesKeywords(workstream, TRAINING_KEYWORDS);
}

export function classifyWorkstream(workstream: { title: string; groupName: string }): {
  isMarketing: boolean;
  isTraining: boolean;
} {
  return {
    isMarketing: isMarketing(workstream),
    isTraining: isTraining(workstream),
  };
}

export function filterByCategory<T extends { title: string; groupName: string }>(
  workstreams: T[],
  category: 'marketing' | 'training'
): T[] {
  if (category === 'marketing') {
    return workstreams.filter(isMarketing);
  }
  return workstreams.filter(isTraining);
}

