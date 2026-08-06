import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import YAML from 'yaml'

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function unquoteEnvValue(value) {
  const cleaned = cleanString(value)
  if (cleaned.length >= 2) {
    const first = cleaned[0]
    const last = cleaned[cleaned.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return cleaned.slice(1, -1)
    }
  }
  return cleaned
}

export async function loadHermesEnvSecret(name, options = {}) {
  const env = options.env ?? process.env
  const explicitValue = cleanString(env[name])
  if (explicitValue) {
    return { value: explicitValue, source: 'environment' }
  }

  const envPath =
    options.envPath ||
    join(cleanString(env.HERMES_HOME) || join(homedir(), '.hermes'), '.env')
  try {
    const content = await readFile(envPath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (match?.[1] !== name) continue
      const value = unquoteEnvValue(match[2])
      if (value) return { value, source: 'hermes-env' }
    }
  } catch {
    // Missing or unreadable secret files are valid for explicitly configured runtimes.
  }

  return { value: '', source: 'unavailable' }
}

export async function loadHermesApiToken(options = {}) {
  const env = options.env ?? process.env
  const explicitToken = cleanString(
    env.HERMES_API_TOKEN || env.CLAUDE_API_TOKEN,
  )
  if (explicitToken) {
    return { token: explicitToken, source: 'environment' }
  }

  const configPath =
    options.configPath ||
    join(cleanString(env.HERMES_HOME) || join(homedir(), '.hermes'), 'config.yaml')

  try {
    const config = YAML.parse(await readFile(configPath, 'utf8'))
    const token = cleanString(
      config?.platforms?.api_server?.extra?.key,
    )
    if (token) return { token, source: 'hermes-config' }
  } catch {
    // A missing or malformed config is valid for unauthenticated gateways.
  }

  return { token: '', source: 'unavailable' }
}
