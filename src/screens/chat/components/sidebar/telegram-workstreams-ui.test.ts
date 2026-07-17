import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('Telegram Workstreams selector', () => {
  it('provides grouped searchable session links with loading and error states', () => {
    const component = source(
      'src/screens/chat/components/sidebar/telegram-workstreams.tsx',
    )

    expect(component).toContain('Telegram Workstreams')
    expect(component).toContain('Search Telegram workstreams')
    expect(component).toContain('groupTelegramWorkstreams')
    expect(component).toContain('Loading Telegram workstreams')
    expect(component).toContain('Failed to load Telegram workstreams')
    expect(component).toContain('to="/chat/$sessionKey"')
    expect(component).toContain('Topic #${workstream.topicId}')
    expect(component).toContain('>\n                            Topic\n')
    expect(component).toContain('#{workstream.topicId}')
    expect(component).toContain("background: 'var(--theme-panel)'")
    expect(component).toContain("color: 'var(--theme-text)'")
  })

  it('mounts the selector above the generic Sessions list', () => {
    const sidebar = source('src/screens/chat/components/chat-sidebar.tsx')
    const telegramIndex = sidebar.indexOf('<TelegramWorkstreams')
    const sessionsIndex = sidebar.indexOf('<SidebarSessions')

    expect(sidebar).toContain(
      "import { TelegramWorkstreams } from './sidebar/telegram-workstreams'",
    )
    expect(telegramIndex).toBeGreaterThan(-1)
    expect(sessionsIndex).toBeGreaterThan(telegramIndex)
  })
})
