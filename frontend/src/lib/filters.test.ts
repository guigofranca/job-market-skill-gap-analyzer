import { describe, expect, it } from 'vitest'
import type { Job, Meta } from '../api/schemas'
import { filtersToSearch, parseFilters } from '../hooks/useFilters'
import { shareAxis } from '../components/charts/chartData'
import { staleFilters } from './filters'
import { jobTags } from './jobTags'

describe('location, workplace and inclusion in the URL', () => {
  it('parses valid values', () => {
    expect(
      parseFilters('?state=SP&city=sp-campinas&workplace=remoto&inclusion=aceita-pcd'),
    ).toMatchObject({
      state: 'SP',
      city: 'sp-campinas',
      workplace: 'remoto',
      inclusion: 'aceita-pcd',
    })
  })

  it.each([
    ['state', '?state=sp'], // codes are upper-case
    ['state', '?state=<b>'],
    ['city', '?city=../../etc'],
    ['workplace', '?workplace=lua'],
    ['inclusion', '?inclusion=todos'],
  ])('drops an invalid %s (%s)', (key, search) => {
    expect(parseFilters(search)).toHaveProperty(key, undefined)
  })

  it('clears removed filters', () => {
    expect(filtersToSearch({ state: 'RJ' }, '?city=rj-niteroi')).toBe('?state=RJ')
  })

  it('drops retired filters from old shared links', () => {
    expect(parseFilters('?source=gupy&contract=clt&days=7')).toEqual({})
    expect(filtersToSearch({ level: 'junior' }, '?source=gupy&days=7&aba=mercado')).toBe(
      '?aba=mercado&level=junior',
    )
  })
})

describe('staleFilters', () => {
  const meta = {
    skills: [{ slug: 'python' }],
    states: [
      { key: 'SP', label: 'São Paulo', count: 3 },
      { key: 'RJ', label: 'Rio de Janeiro', count: 1 },
    ],
    cities: [{ key: 'sp-campinas', label: 'Campinas', state: 'SP', count: 2 }],
  } as unknown as Meta

  it('keeps values that exist in the dataset', () => {
    expect(staleFilters({ skill: 'python', state: 'SP', city: 'sp-campinas' }, meta)).toEqual({})
  })

  it('clears unknown skills, states and cities, and cities outside the chosen state', () => {
    expect(staleFilters({ skill: 'cobol', state: 'AC', city: 'ac-rio-branco' }, meta)).toEqual({
      skill: undefined,
      state: undefined,
      city: undefined,
    })
    expect(staleFilters({ state: 'RJ', city: 'sp-campinas' }, meta)).toEqual({ city: undefined })
  })
})

describe('jobTags', () => {
  const base = {
    workplace: null,
    contracts: [],
    affirmative: [],
    accepts_pcd: false,
    requirements: {
      courses: [],
      courses_open: false,
      degree_required: false,
      min_semester: null,
      max_semester: null,
      graduation_from: null,
      graduation_to: null,
      english: null,
      english_level: null,
      weekly_hours: null,
    },
  } as unknown as Job

  it('lists workplace, contracts and inclusion in reading order', () => {
    const job = {
      ...base,
      workplace: 'hibrido',
      contracts: ['clt', 'pj'],
      affirmative: ['mulheres', 'pessoas-negras'],
      accepts_pcd: true,
    } as Job
    expect(jobTags(job).map((tag) => tag.label)).toEqual([
      'Híbrido',
      'CLT',
      'PJ',
      'Afirmativa: mulheres, pessoas negras',
      'Aceita PcD',
    ])
  })

  it('does not repeat "Aceita PcD" on a PcD affirmative job', () => {
    const job = { ...base, affirmative: ['pcd'], accepts_pcd: true } as Job
    expect(jobTags(job).map((tag) => tag.label)).toEqual(['Afirmativa: PcD'])
  })

  it('returns nothing for a job without attributes', () => {
    expect(jobTags(base)).toEqual([])
  })
})

describe('shareAxis', () => {
  it.each([
    [0.41, 0.5, [0, 0.1, 0.2, 0.3, 0.4, 0.5]],
    [0.12, 0.15, [0, 0.05, 0.1, 0.15]],
    [0.3, 0.3, [0, 0.1, 0.2, 0.3]],
    [0.6, 0.6, [0, 0.2, 0.4, 0.6]],
    [0.98, 1, [0, 0.2, 0.4, 0.6, 0.8, 1]],
  ])('max share %s ends on a tick (%s)', (maxShare, domainMax, ticks) => {
    expect(shareAxis(maxShare)).toEqual({ domainMax, ticks })
  })
})
