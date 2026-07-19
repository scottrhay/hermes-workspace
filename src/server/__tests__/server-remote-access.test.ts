import { describe, expect, it } from 'vitest'
import {
  isRemoteAddressAllowed,
  normalizeRemoteAddress,
  parseAllowedRemoteIps,
} from '../../../server-remote-access.js'

describe('server remote IP allow-list', () => {
  it('normalizes IPv4-mapped addresses and parses a compact allow-list', () => {
    expect(normalizeRemoteAddress('::ffff:192.168.3.77')).toBe('192.168.3.77')
    expect(parseAllowedRemoteIps('192.168.3.77, 100.90.182.4')).toEqual([
      '192.168.3.77',
      '100.90.182.4',
    ])
  })

  it('always permits loopback and permits only explicitly allowed remote IPs', () => {
    const allowed = ['192.168.3.77']
    expect(isRemoteAddressAllowed('127.0.0.1', allowed)).toBe(true)
    expect(isRemoteAddressAllowed('::1', allowed)).toBe(true)
    expect(isRemoteAddressAllowed('::ffff:192.168.3.77', allowed)).toBe(true)
    expect(isRemoteAddressAllowed('192.168.2.88', allowed)).toBe(false)
    expect(isRemoteAddressAllowed(undefined, allowed)).toBe(false)
  })
})
