import { access, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const rootRouteUrl = new URL('./__root.tsx', import.meta.url)
const missionControlLogoUrl = new URL(
  '../../public/aia-mission-control-logo.webp',
  import.meta.url,
)

describe('AIA Mission Control startup splash', () => {
  it('uses the repository-managed AIA logo and Mission Control name', async () => {
    const source = await readFile(rootRouteUrl, 'utf8')

    await expect(access(missionControlLogoUrl)).resolves.toBeUndefined()
    expect(source).toContain('/aia-mission-control-logo.webp')
    expect(source).toContain('alt="AIA Copilot"')
    expect(source).toContain('AIA Copilot')
    expect(source).toContain('Mission Control')
    expect(source).not.toContain('/claude-banner.png')
    expect(source).not.toContain('/claude-banner-light.png')
  })
})
