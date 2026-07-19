export function normalizeRemoteAddress(address) {
  const normalized = String(address || '').trim().toLowerCase()
  return normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized
}

export function parseAllowedRemoteIps(value) {
  return [...new Set(String(value || '').split(',').map(normalizeRemoteAddress).filter(Boolean))]
}

export function isLoopbackAddress(address) {
  const normalized = normalizeRemoteAddress(address)
  return normalized === '127.0.0.1' || normalized === '::1'
}

export function isRemoteAddressAllowed(address, allowedRemoteIps) {
  const normalized = normalizeRemoteAddress(address)
  if (!normalized) return false
  return isLoopbackAddress(normalized) || allowedRemoteIps.includes(normalized)
}
