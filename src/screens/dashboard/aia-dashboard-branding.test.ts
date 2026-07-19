import { access, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const dashboardUrl = new URL('./dashboard-screen.tsx', import.meta.url)
const logoUrl = new URL('../../../public/aia-mission-control-logo.webp', import.meta.url)

describe('AIA dashboard branding', () => {
  it('uses the AIA Copilot logo and Mission Control title', async () => {
    const source = await readFile(dashboardUrl, 'utf8')

    expect(source).toContain('src="/aia-mission-control-logo.webp"')
    expect(source).toContain('alt="AIA Copilot"')
    expect(source).toContain('AIA Copilot Hermes Mission Control')
    expect(source).not.toContain('Hermes Workspace\n            </h1>')
    await expect(access(logoUrl)).resolves.toBeUndefined()
  })
})
