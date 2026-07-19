import { access, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { dedupeTransferredFiles } from './attachment-transfer'

const sourceUrl = (path: string) => new URL(path, import.meta.url)

const assistantAvatarUrl = sourceUrl(
  '../../../components/avatars/assistant-avatar.tsx',
)
const agentAvatarUrl = sourceUrl('../../../components/agent-avatar.tsx')
const userAvatarUrl = sourceUrl('../../../components/avatars/user-avatar.tsx')
const composerUrl = sourceUrl('./chat-composer.tsx')
const lionAssetUrl = sourceUrl('../../../../public/aia-lion-avatar.webp')

describe('AIA chat experience', () => {
  it('uses Scott’s lion image for assistant and agent avatars', async () => {
    const [assistantAvatar, agentAvatar, userAvatar] = await Promise.all([
      readFile(assistantAvatarUrl, 'utf8'),
      readFile(agentAvatarUrl, 'utf8'),
      readFile(userAvatarUrl, 'utf8'),
    ])

    await expect(access(lionAssetUrl)).resolves.toBeUndefined()
    expect(assistantAvatar).toContain('src="/aia-lion-avatar.webp"')
    expect(agentAvatar).toContain('src="/aia-lion-avatar.webp"')
    expect(userAvatar).toContain('src="/aia-lion-avatar.webp"')
    expect(assistantAvatar).not.toContain('/claude-avatar.webp')
    expect(agentAvatar).not.toContain('/claude-avatar.webp')
  })

  it('deduplicates clipboard item/file representations without lastModified', () => {
    const clipboardItem = {
      name: 'lion.png',
      size: 1024,
      type: 'image/png',
      lastModified: 1,
    } as File
    const clipboardFile = {
      ...clipboardItem,
      lastModified: 2,
    } as File

    expect(dedupeTransferredFiles([clipboardItem, clipboardFile])).toEqual([
      clipboardItem,
    ])
  })

  it('shows an explicit response-in-progress status in the composer', async () => {
    const composer = await readFile(composerUrl, 'utf8')

    expect(composer).toContain('AIA Copilot is responding')
    expect(composer).toContain('role="status"')
    expect(composer).toContain('aria-live="polite"')
  })
})
