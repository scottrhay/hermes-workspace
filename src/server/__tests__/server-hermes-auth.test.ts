import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadHermesApiToken } from '../../../server-hermes-auth.js'

const tempDirs: Array<string> = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function configPath(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'workspace-hermes-auth-'))
  tempDirs.push(dir)
  const path = join(dir, 'config.yaml')
  await writeFile(path, content, { mode: 0o600 })
  return path
}

describe('loadHermesApiToken', () => {
  it('preserves an explicitly supplied workspace token', async () => {
    const result = await loadHermesApiToken({
      env: { HERMES_API_TOKEN: 'explicit-token' },
      configPath: '/does/not/exist',
    })

    expect(result).toEqual({ token: 'explicit-token', source: 'environment' })
  })

  it('loads the canonical Hermes API server key without exposing it', async () => {
    const path = await configPath(`
platforms:
  api_server:
    enabled: true
    extra:
      key: canonical-secret
`)

    const result = await loadHermesApiToken({ env: {}, configPath: path })

    expect(result).toEqual({ token: 'canonical-secret', source: 'hermes-config' })
  })

  it('degrades safely when the config is missing or malformed', async () => {
    const malformed = await configPath('platforms: [not-a-map')

    await expect(loadHermesApiToken({ env: {}, configPath: malformed })).resolves.toEqual({
      token: '',
      source: 'unavailable',
    })
    await expect(loadHermesApiToken({ env: {}, configPath: '/missing' })).resolves.toEqual({
      token: '',
      source: 'unavailable',
    })
  })
})
