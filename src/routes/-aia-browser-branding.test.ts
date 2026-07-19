import { access, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const rootRouteUrl = new URL('./__root.tsx', import.meta.url)
const manifestUrl = new URL('../../public/manifest.json', import.meta.url)
const publicAssetUrl = (name: string) =>
  new URL(`../../public/${name}`, import.meta.url)

describe('AIA browser branding', () => {
  it('uses the Mission Control name and icon in the browser', async () => {
    const source = await readFile(rootRouteUrl, 'utf8')

    expect(source).toContain("title: 'AIA Copilot Mission Control'")
    expect(source).toContain("href: '/aia-copilot-favicon.png'")
    expect(source).not.toContain("title: 'Hermes Workspace'")
    await expect(
      access(publicAssetUrl('aia-copilot-favicon.png')),
    ).resolves.toBeUndefined()
  })

  it('uses the same branding when installed as an app', async () => {
    const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'))

    expect(manifest.name).toBe('AIA Copilot Mission Control')
    expect(manifest.short_name).toBe('Mission Control')
    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual([
      '/aia-copilot-icon-192.png',
      '/aia-copilot-icon-512.png',
    ])

    await Promise.all([
      access(publicAssetUrl('aia-copilot-icon-192.png')),
      access(publicAssetUrl('aia-copilot-icon-512.png')),
      access(publicAssetUrl('aia-copilot-apple-touch-icon.png')),
    ])
  })
})
