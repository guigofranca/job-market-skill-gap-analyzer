import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApiError, apiGet, buildUrl } from './client'

vi.mock('../config/env', () => ({
  getConfig: () => ({ apiBaseUrl: 'http://api.test', apiTimeoutMs: 1000 }),
}))

const Schema = z.object({ total: z.number().int() })

function mockFetch(response: Response | Error) {
  const fn = vi.fn<() => Promise<Response>>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'req-123' },
    ...init,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildUrl', () => {
  it('skips empty values and joins arrays', () => {
    const url = buildUrl('http://api.test', '/api/v1/jobs', {
      level: 'estagio',
      area: undefined,
      skill: '',
      known: ['python', 'sql'],
      limit: 10,
    })
    expect(url.toString()).toBe(
      'http://api.test/api/v1/jobs?level=estagio&known=python%2Csql&limit=10',
    )
  })

  it('encodes user input instead of interpolating it', () => {
    const url = buildUrl('http://api.test', '/api/v1/jobs', { q: 'dados&level=senior' })
    expect(url.searchParams.get('q')).toBe('dados&level=senior')
    expect(url.searchParams.get('level')).toBeNull()
  })
})

describe('apiGet', () => {
  it('returns validated data and sends no credentials', async () => {
    const fetchMock = mockFetch(json({ total: 3 }))
    await expect(apiGet('/x', Schema)).resolves.toEqual({ total: 3 })
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(init.credentials).toBe('omit')
  })

  it('rejects responses that do not match the schema', async () => {
    mockFetch(json({ total: 'three' }))
    await expect(apiGet('/x', Schema)).rejects.toMatchObject({ kind: 'invalid_response' })
  })

  it('rejects non-JSON responses', async () => {
    mockFetch(new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }))
    await expect(apiGet('/x', Schema)).rejects.toMatchObject({ kind: 'invalid_response' })
  })

  it.each([
    [503, 'unavailable'],
    [429, 'rate_limited'],
    [422, 'bad_request'],
    [500, 'server'],
  ] as const)('maps HTTP %i to %s', async (status, kind) => {
    mockFetch(json({ detail: 'x' }, { status }))
    const error = await apiGet('/x', Schema).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind, status, requestId: 'req-123' })
  })

  it('turns network failures into a friendly error', async () => {
    mockFetch(new TypeError('Failed to fetch'))
    const error = await apiGet('/x', Schema).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ kind: 'network', retryable: true })
    expect((error as Error).message).toContain('backend')
  })
})
