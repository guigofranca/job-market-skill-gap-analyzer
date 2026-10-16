const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Returns a normalized href only for http(s) URLs. Anything else (javascript:, data:, malformed)
 * yields undefined, so the caller renders plain text instead of a link. Defense in depth: the API
 * schema already rejects non-http URLs.
 */
export function toSafeHref(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}
