import { describe, expect, it } from 'vitest'
import { formatTelegramMirrorText } from './telegram-mirror'

describe('formatTelegramMirrorText', () => {
  it('prefixes the text with the WebUI marker', () => {
    expect(formatTelegramMirrorText('hello there')).toBe('🖥️ hello there')
  })

  it('trims surrounding whitespace before prefixing', () => {
    expect(formatTelegramMirrorText('  hello there  \n')).toBe(
      '🖥️ hello there',
    )
  })

  it('truncates the result to exactly 4096 characters', () => {
    const longText = 'a'.repeat(5000)
    const result = formatTelegramMirrorText(longText)
    expect(result.length).toBe(4096)
    expect(result.startsWith('🖥️ ')).toBe(true)
  })

  it('handles empty input by returning just the prefix', () => {
    expect(formatTelegramMirrorText('')).toBe('🖥️ ')
    expect(formatTelegramMirrorText('   ')).toBe('🖥️ ')
  })
})
