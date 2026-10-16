import { describe, expect, it } from 'vitest'
import { parseConfig, ConfigError } from '../config/env'
import { filtersToSearch, parseFilters } from '../hooks/useFilters'
import { formatDate, formatPercent } from './format'
import { toSafeHref } from './safeUrl'

describe('toSafeHref', () => {
  it.each([
    ['https://empresa.gupy.io/job/1', 'https://empresa.gupy.io/job/1'],
    ['http://example.com/vaga?id=2', 'http://example.com/vaga?id=2'],
  ])('keeps http(s) urls: %s', (input, expected) => {
    expect(toSafeHref(input)).toBe(expected)
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>',
    'not a url',
    '',
    null,
  ])('rejects unsafe or malformed values: %s', (input) => {
    expect(toSafeHref(input)).toBeUndefined()
  })
})

describe('parseConfig', () => {
  it('normalizes a valid configuration', () => {
    expect(
      parseConfig({ VITE_API_BASE_URL: 'http://localhost:8000/', VITE_API_TIMEOUT_MS: '5000' }),
    ).toEqual({
      apiBaseUrl: 'http://localhost:8000',
      apiTimeoutMs: 5000,
    })
  })

  it.each([
    {},
    { VITE_API_BASE_URL: 'ftp://x' },
    { VITE_API_BASE_URL: 'http://x', VITE_API_TIMEOUT_MS: '5' },
  ])('rejects invalid configuration %#', (env) => {
    expect(() => parseConfig(env)).toThrow(ConfigError)
  })
})

describe('URL filters', () => {
  it('keeps valid values and drops invalid ones', () => {
    expect(parseFilters('?level=junior&area=hacker&skill=<script>')).toEqual({
      level: 'junior',
      area: undefined,
      skill: undefined,
    })
  })

  it('writes filters back preserving unrelated params', () => {
    expect(filtersToSearch({ level: 'estagio', skill: 'python' }, '?utm=x&area=dados')).toBe(
      '?utm=x&level=estagio&skill=python',
    )
  })
})

describe('format', () => {
  it('formats percentages in pt-BR', () => {
    expect(formatPercent(0.456)).toBe('46%')
    expect(formatPercent(0.034)).toBe('3,4%')
  })

  it('formats ISO dates without timezone shifts', () => {
    expect(formatDate('2026-10-01')).toBe('01/10/2026')
    expect(formatDate(null)).toBe('—')
  })
})
