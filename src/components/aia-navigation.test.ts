import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const NAVIGATION_FILES = [
  'src/screens/chat/components/chat-sidebar.tsx',
  'src/components/mobile-hamburger-menu.tsx',
  'src/components/mobile-tab-bar.tsx',
] as const

describe('AIA navigation', () => {
  it('brands the desktop sidebar as Mission Control', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/screens/chat/components/chat-sidebar.tsx'),
      'utf8',
    )

    expect(source).toContain('src="/aia-session-logo.webp"')
    expect(source).toContain('alt="AIA Copilot"')
    expect(source).toContain('Mission Control')
    expect(source).not.toContain('<span>New Session</span>')
    expect(source).not.toContain('Hermes Workspace\n                </span>')
  })

  for (const relPath of NAVIGATION_FILES) {
    it(`${relPath} does not expose HermesWorld`, () => {
      const source = readFileSync(resolve(process.cwd(), relPath), 'utf8')

      expect(source).not.toMatch(/HermesWorld featured link/)
      expect(source).not.toMatch(/label:\s*['"]HermesWorld['"]/)
      expect(source).not.toMatch(/label:\s*['"]Play['"]/)
      expect(source).not.toMatch(/to=["']\/playground["']/)
      expect(source).not.toMatch(/to:\s*['"]\/playground['"]/)
    })
  }
})
