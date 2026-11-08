import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import { constants } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readOpenBrainStats } from './openbrain'

const realOpen = fs.open.bind(fs)
const NOW = Date.parse('2026-11-06T15:00:00Z')
const snapshot = () => ({
  schemaVersion: 2, generatedAt: new Date(NOW).toISOString(), status: 'current',
  scope: 'aiacopilot:operations', coverage: 'designated-reader', fallback: false,
  counts: { readableFiles: 257, anchorSources: 5, verifiedAnchors: 5, admittedOperationsNotes: 1 },
  admissionRevision: 1,
})
let networkCalls: number
let dir: string
let file: string
const save = async (value: unknown) => fs.writeFile(file, JSON.stringify(value))
beforeEach(async () => {
  networkCalls = 0
  const denyNetwork = () => { networkCalls++; throw new Error('Network forbidden') }
  vi.spyOn(net, 'connect').mockImplementation(denyNetwork)
  vi.spyOn(net, 'createConnection').mockImplementation(denyNetwork)
  vi.spyOn(http, 'request').mockImplementation(denyNetwork)
  vi.spyOn(https, 'request').mockImplementation(denyNetwork)
  vi.stubGlobal('fetch', denyNetwork)
  dir = await fs.mkdtemp(join(tmpdir(), 'brain-metadata-'))
  file = join(dir, 'metadata.json')
  await save(snapshot())
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  // Redirect only the fixed path. Preserve actual OS open/read/stat/close and no-follow.
  vi.spyOn(fs, 'open').mockImplementation(async (path, flags) => {
    expect(path).toBe('/run/aia-brain/metadata.json')
    expect(flags).toBe(constants.O_RDONLY | constants.O_NOFOLLOW)
    return realOpen(file, flags)
  })
  syncBuiltinESMExports()
  vi.stubEnv('OPENBRAIN_DB_URL', 'postgresql://never-connect.invalid/rejected')
})
afterEach(async () => {
  expect(networkCalls).toBe(0)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  syncBuiltinESMExports()
  vi.unstubAllEnvs()
  await fs.rm(dir, { recursive: true, force: true })
})
describe('designated-reader metadata snapshot', () => {
  it('reads exact metadata without legacy configuration', async () => {
    expect(await readOpenBrainStats()).toEqual(snapshot())
    vi.stubEnv('OPENBRAIN_DB_URL', '')
    expect(await readOpenBrainStats()).toEqual(snapshot())
  })
  it.each([300000, 300001])('marks freshness boundary %i', async (age) => {
    await save({ ...snapshot(), generatedAt: new Date(NOW - age).toISOString() })
    expect((await readOpenBrainStats()).status).toBe(age > 300000 ? 'stale' : 'current')
  })
  it('accepts Python microseconds and UTC offset', async () => {
    await save({ ...snapshot(), generatedAt: '2026-11-06T15:00:00.000000+00:00' })
    expect((await readOpenBrainStats()).status).toBe('current')
  })
  it('strips unknown fields at every projected level', async () => {
    const sentinel = 'private-source-opaque-13e71'
    await save({ ...snapshot(), sourceContent: sentinel, counts: { ...snapshot().counts, path: sentinel } })
    expect(JSON.stringify(await readOpenBrainStats())).not.toContain(sentinel)
    expect(await readOpenBrainStats()).toEqual(snapshot())
  })
  it('removes counts/revision when unavailable', async () => {
    await save({ ...snapshot(), status: 'unavailable' })
    const result = await readOpenBrainStats()
    expect(result.status).toBe('unavailable')
    expect(result).not.toHaveProperty('counts')
    expect(result).not.toHaveProperty('admissionRevision')
  })
  it.each(['schemaVersion', 'generatedAt', 'status', 'scope', 'coverage', 'fallback', 'counts', 'admissionRevision'])('rejects missing %s', async (key) => {
    const value: Record<string, unknown> = snapshot()
    delete value[key]
    await save(value)
    await expect(readOpenBrainStats()).rejects.toThrow()
  })
  it.each([
    { schemaVersion: '2' }, { schemaVersion: 1 }, { coverage: 'restricted-approved-sources' },
    { scope: 'client:private' }, { coverage: 'all' },
    { fallback: true }, { fallback: 0 }, { status: 'stale' },
    { generatedAt: 'broken' }, { generatedAt: ['2026-11-06T15:00:00.000Z'] },
    { generatedAt: 'Fri, 06 Nov 2026 15:00:00 GMT' },
    { generatedAt: '2026-11-06T15:01:00.001Z' },
    { admissionRevision: -1 }, { admissionRevision: 0.5 }, { admissionRevision: '1' },
  ])('rejects invalid schema %j', async (change) => {
    await save({ ...snapshot(), ...change })
    await expect(readOpenBrainStats()).rejects.toThrow()
  })
  it.each([
    { anchorSources: 4 }, { verifiedAnchors: 4 }, { anchorSources: '5' },
    { readableFiles: 0 }, { readableFiles: 100001 }, { readableFiles: 1.5 }, { readableFiles: '257' },
    { admittedOperationsNotes: -1 }, { admittedOperationsNotes: 0.5 },
    { admittedOperationsNotes: '1' }, { admittedOperationsNotes: 101 },
  ])('rejects invalid counts %j', async (change) => {
    await save({ ...snapshot(), counts: { ...snapshot().counts, ...change } })
    await expect(readOpenBrainStats()).rejects.toThrow()
  })
  it.each(['null', '[]', '{', '', ' '.repeat(4097)])('rejects invalid/oversized file (%#)', async (value) => {
    await fs.writeFile(file, value)
    await expect(readOpenBrainStats()).rejects.toThrow()
  })
  it('accepts exactly 4096 bytes', async () => {
    await fs.writeFile(file, JSON.stringify(snapshot()).padEnd(4096))
    expect(await readOpenBrainStats()).toEqual(snapshot())
  })
  it('rejects missing file', async () => {
    await fs.unlink(file)
    await expect(readOpenBrainStats()).rejects.toThrow()
  })
  it('rejects real final-component symlink', async () => {
    const target = join(dir, 'target.json')
    await fs.rename(file, target)
    await fs.symlink(target, file)
    await expect(readOpenBrainStats()).rejects.toMatchObject({ code: 'ELOOP' })
  })
  it('rejects directory and closes handle', async () => {
    await fs.unlink(file)
    await fs.mkdir(file)
    const handle = await realOpen(file, constants.O_RDONLY)
    const close = vi.spyOn(handle, 'close')
    vi.mocked(fs.open).mockResolvedValueOnce(handle)
    await expect(readOpenBrainStats()).rejects.toThrow('Invalid snapshot')
    expect(close).toHaveBeenCalledOnce()
  })
  it('closes handle on read failure', async () => {
    const handle = await realOpen(file, constants.O_RDONLY)
    const close = vi.spyOn(handle, 'close')
    vi.spyOn(handle, 'read').mockRejectedValueOnce(new Error('read-failure'))
    vi.mocked(fs.open).mockResolvedValueOnce(handle)
    await expect(readOpenBrainStats()).rejects.toThrow('read-failure')
    expect(close).toHaveBeenCalledOnce()
  })
})
