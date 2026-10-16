import type { z } from 'zod'
import { getConfig } from '../config/env'

export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'unavailable'
  | 'rate_limited'
  | 'bad_request'
  | 'server'
  | 'invalid_response'

const USER_MESSAGES: Record<ApiErrorKind, string> = {
  network: 'Não foi possível conectar à API. Verifique se o backend está rodando.',
  timeout: 'A API demorou demais para responder. Tente novamente.',
  unavailable: 'Os dados ainda não foram gerados. Rode o pipeline no backend (job-analyzer run).',
  rate_limited: 'Muitas requisições em pouco tempo. Aguarde alguns segundos.',
  bad_request: 'Filtro inválido. Limpe os filtros e tente novamente.',
  server: 'A API encontrou um erro inesperado.',
  invalid_response: 'A API respondeu em um formato inesperado.',
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | undefined
  readonly requestId: string | undefined

  constructor(kind: ApiErrorKind, options: { status?: number; requestId?: string | null } = {}) {
    super(USER_MESSAGES[kind])
    this.name = 'ApiError'
    this.kind = kind
    this.status = options.status
    this.requestId = options.requestId ?? undefined
  }

  /** Transient failures are worth retrying automatically; client/contract errors are not. */
  get retryable(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || this.kind === 'server'
  }
}

export type QueryValue = string | number | readonly string[] | null | undefined

export function buildUrl(baseUrl: string, path: string, params: Record<string, QueryValue> = {}) {
  const url = new URL(`${baseUrl}${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (value.length > 0) url.searchParams.set(key, value.join(','))
    } else {
      url.searchParams.set(key, String(value))
    }
  }
  return url
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 503) return 'unavailable'
  if (status === 429) return 'rate_limited'
  if (status >= 400 && status < 500) return 'bad_request'
  return 'server'
}

/**
 * GET a JSON endpoint and validate the body against `schema`.
 * Combines the caller's AbortSignal (React Query cancels stale requests) with a timeout, sends no
 * credentials, and converts every failure mode into an ApiError with a user-safe message.
 */
export async function apiGet<T>(
  path: string,
  schema: z.ZodType<T>,
  params: Record<string, QueryValue> = {},
  signal?: AbortSignal,
): Promise<T> {
  const { apiBaseUrl, apiTimeoutMs } = getConfig()
  const url = buildUrl(apiBaseUrl, path, params)
  const timeout = AbortSignal.timeout(apiTimeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: combined,
    })
  } catch (error) {
    if (signal?.aborted) throw error // cancelled by the caller: not an error to display
    throw new ApiError(timeout.aborted ? 'timeout' : 'network')
  }

  const requestId = response.headers.get('X-Request-ID')
  if (!response.ok) {
    throw new ApiError(kindForStatus(response.status), { status: response.status, requestId })
  }
  if (!response.headers.get('Content-Type')?.includes('application/json')) {
    throw new ApiError('invalid_response', { status: response.status, requestId })
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApiError('invalid_response', { status: response.status, requestId })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    if (import.meta.env.DEV) console.error(`Invalid response from ${path}`, parsed.error.issues)
    throw new ApiError('invalid_response', { status: response.status, requestId })
  }
  return parsed.data
}
