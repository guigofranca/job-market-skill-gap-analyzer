import { z } from 'zod'

/**
 * Runtime-validated configuration. Vite inlines VITE_* variables at build time, so they are
 * public by definition: only non-secret settings belong here.
 */
const EnvSchema = z.object({
  VITE_API_BASE_URL: z
    .url({ protocol: /^https?$/, error: 'deve ser uma URL http(s) válida' })
    .transform((url) => url.replace(/\/+$/, '')),
  VITE_API_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
})

export interface AppConfig {
  apiBaseUrl: string
  apiTimeoutMs: number
}

export class ConfigError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(`Configuração inválida: ${issues.join('; ')}`)
    this.name = 'ConfigError'
    this.issues = issues
  }
}

export function parseConfig(env: Record<string, unknown>): AppConfig {
  const result = EnvSchema.safeParse(env)
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`),
    )
  }
  return {
    apiBaseUrl: result.data.VITE_API_BASE_URL,
    apiTimeoutMs: result.data.VITE_API_TIMEOUT_MS,
  }
}

let cached: AppConfig | undefined

/** Parsed once; throws ConfigError (caught by the root error boundary) when invalid. */
export function getConfig(): AppConfig {
  cached ??= parseConfig(import.meta.env)
  return cached
}
