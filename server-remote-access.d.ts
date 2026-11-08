export function normalizeRemoteAddress(address: unknown): string
export function parseAllowedRemoteIps(value: unknown): string[]
export function isLoopbackAddress(address: unknown): boolean
export function isRemoteAddressAllowed(address: unknown, allowedRemoteIps: readonly string[]): boolean
