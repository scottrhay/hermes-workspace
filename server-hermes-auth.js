import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import YAML from 'yaml'

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : ''
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
