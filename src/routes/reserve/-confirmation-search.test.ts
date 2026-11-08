import { describe, expect, it } from 'vitest'
import { validateConfirmationSearch } from './-confirmation-search'

describe('confirmation search', () => {
  it('preserves the emailed token exactly', () => {
    expect(validateConfirmationSearch({ token: 'abc-123' })).toEqual({ token: 'abc-123' })
  })
  it('rejects missing and non-string tokens', () => {
    for (const token of [undefined, null, 123, ['abc'], {}]) {
      expect(validateConfirmationSearch({ token })).toEqual({ token: '' })
    }
  })
})
