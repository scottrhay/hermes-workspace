import type {
  TelegramWorkstream,
  TelegramWorkstreamGroup,
} from './telegram-workstreams'

export type WorkstreamState = 'working' | 'recent'

const GROUP_ICONS: Record<string, string> = {
  'executive administration': '⭐',
  research: '📁',
  marketing: '✏️',
  training: '🎓',
  finance: '💰',
  development: '💻',
  projects: '💡',
  spiritual: '🙏',
}

export function getGroupIcon(groupName: string): string {
  return GROUP_ICONS[groupName.trim().toLowerCase()] ?? '💬'
}

export function getWorkstreamState(
  workstream: TelegramWorkstream,
): WorkstreamState {
  return workstream.isActive ? 'working' : 'recent'
}

export function getAttentionWorkstreams(
  workstreams: Array<TelegramWorkstream>,
  limit = 8,
): Array<TelegramWorkstream> {
  return [...workstreams]
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
      return b.updatedAt - a.updatedAt
    })
    .slice(0, limit)
}

export function sortWorkstreamGroups(
  groups: Array<TelegramWorkstreamGroup>,
): Array<TelegramWorkstreamGroup> {
  return [...groups]
    .map((group) => ({
      ...group,
      workstreams: [...group.workstreams].sort(
        (a, b) => b.updatedAt - a.updatedAt,
      ),
    }))
    .sort((a, b) => {
      const aNewest = a.workstreams[0]?.updatedAt ?? 0
      const bNewest = b.workstreams[0]?.updatedAt ?? 0
      return bNewest - aNewest || a.name.localeCompare(b.name)
    })
}

export function formatWorkstreamTime(
  timestamp: number,
  now = Date.now(),
): string {
  if (!timestamp) return 'No activity'
  const elapsed = Math.max(0, now - timestamp)
  if (elapsed < 60_000) return 'Just now'
  if (elapsed < 60 * 60_000) return `${Math.floor(elapsed / 60_000)}m ago`
  if (elapsed < 24 * 60 * 60_000)
    return `${Math.floor(elapsed / (60 * 60_000))}h ago`
  if (elapsed < 7 * 24 * 60 * 60_000)
    return `${Math.floor(elapsed / (24 * 60 * 60_000))}d ago`
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp))
}
