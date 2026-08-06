import { access, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const dashboardUrl = new URL('./dashboard-screen.tsx', import.meta.url)
const layoutUrl = new URL('./lib/use-dashboard-layout.ts', import.meta.url)
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

  it('removes the non-business achievements section from the dashboard and layout editor', async () => {
    const [dashboardSource, layoutSource] = await Promise.all([
      readFile(dashboardUrl, 'utf8'),
      readFile(layoutUrl, 'utf8'),
    ])

    expect(dashboardSource).not.toContain('AchievementsCard')
    expect(dashboardSource).not.toContain('id="achievements"')
    expect(layoutSource).not.toContain("| 'achievements'")
    expect(layoutSource).not.toContain("id: 'achievements'")
  })
})
