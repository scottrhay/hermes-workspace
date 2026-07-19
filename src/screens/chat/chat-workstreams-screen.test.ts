import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const routeUrl = new URL('../../routes/chat/index.tsx', import.meta.url)
const screenUrl = new URL('./chat-workstreams-screen.tsx', import.meta.url)

describe('Mission Control chat index', () => {
  it('renders the grouped Telegram topic page instead of redirecting', async () => {
    const [route, screen] = await Promise.all([
      readFile(routeUrl, 'utf8'),
      readFile(screenUrl, 'utf8'),
    ])

    expect(route).toContain('ChatWorkstreamsScreen')
    expect(route).not.toContain('throw redirect')
    expect(screen).toContain('Needs your attention')
    expect(screen).toContain('Search topics')
    expect(screen).toContain('group.workstreams.map')
    expect(screen).toContain('params={{ sessionKey: workstream.sessionId }}')
    expect(screen).toContain('Ariel · connecting')
    expect(screen).toContain('Ariel · unavailable')
    expect(screen).toContain('Ariel · connected')
    expect(screen).not.toContain('Ariel · online')
  })
})
