import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const componentPath = resolve(
  process.cwd(),
  'src/screens/chat/components/chat-empty-state.tsx',
)
const logoPath = resolve(process.cwd(), 'public/aia-session-logo.webp')

describe('new-session branding', () => {
  it('uses the AIA logo instead of the Hermes avatar', () => {
    const source = readFileSync(componentPath, 'utf8')

    expect(source).toContain('src="/aia-session-logo.webp"')
    expect(source).toContain('alt="AIA Copilot"')
    expect(source).not.toContain('src="/claude-avatar.webp"')
  })

  it('ships the AIA logo asset', () => {
    expect(existsSync(logoPath)).toBe(true)
  })
})
