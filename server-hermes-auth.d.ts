type HermesEnvironment = Record<string, string | undefined>
export function loadHermesEnvSecret(name: string, options?: {
  env?: HermesEnvironment
  envPath?: string
}): Promise<{ value: string; source: 'environment' | 'hermes-env' | 'unavailable' }>
export function loadHermesApiToken(options?: {
  env?: HermesEnvironment
  configPath?: string
}): Promise<{ token: string; source: 'environment' | 'hermes-config' | 'unavailable' }>
