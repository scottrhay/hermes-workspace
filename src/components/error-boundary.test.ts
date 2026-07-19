import { describe, expect, it } from 'vitest'

import {
  claimStaleRuntimeRecovery,
  isRecoverableStaleRuntimeError,
} from './error-boundary'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe('stale runtime recovery', () => {
  it.each([
    'Failed to fetch dynamically imported module: http://localhost:3000/assets/chat-panel-old.js',
    'TypeError: error loading dynamically imported module',
    'ChunkLoadError: Loading chunk 42 failed',
    'Importing a module script failed',
  ])('recognizes a stale build asset error: %s', (message) => {
    expect(isRecoverableStaleRuntimeError(new Error(message))).toBe(true)
  })

  it('preserves the existing React DOM mismatch recovery', () => {
    expect(
      isRecoverableStaleRuntimeError(
        new Error(
          "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node",
        ),
      ),
    ).toBe(true)
  })

  it('does not reload for unrelated application errors', () => {
    expect(isRecoverableStaleRuntimeError(new Error('API returned 500'))).toBe(
      false,
    )
  })

  it('claims only one recovery inside the retry window', () => {
    const storage = new MemoryStorage()
    const error = new Error('Failed to fetch dynamically imported module')

    expect(claimStaleRuntimeRecovery(error, storage, 100_000)).toBe(true)
    expect(claimStaleRuntimeRecovery(error, storage, 110_000)).toBe(false)
    expect(claimStaleRuntimeRecovery(error, storage, 131_000)).toBe(true)
  })
})
