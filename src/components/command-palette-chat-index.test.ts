import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const commandPaletteUrl = new URL('./command-palette.tsx', import.meta.url)

describe('command palette on the Mission Control chat index', () => {
  it('queues conversation commands and opens the last concrete chat session', async () => {
    const source = await readFile(commandPaletteUrl, 'utf8')

    expect(source).toContain("pathname.startsWith('/chat/')")
    expect(source).toContain('queueCommandAndOpenConversation()')
    expect(source).toContain("to: '/chat/$sessionKey'")
    expect(source).toContain("localStorage.getItem('claude-last-session')")
  })
})
