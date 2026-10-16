import { describe, expect, it } from 'vitest'
import { closingSoon, parseApplications, sortApplications, type Application } from './applications'

function app(id: string, overrides: Partial<Application> = {}, deadline: string | null = null) {
  return {
    job: {
      id: id.repeat(16).slice(0, 16),
      title: `Vaga ${id}`,
      company: 'ACME',
      location: 'Recife, PE',
      url: 'https://acme.gupy.io/job/1',
      level: 'estagio',
      area: 'dados',
      source: 'gupy',
      deadline,
    },
    status: 'salva',
    note: '',
    savedAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  } satisfies Application
}

describe('applications', () => {
  it('drops invalid stored entries one by one, and duplicates', () => {
    const stored = [app('a'), { job: { id: 'x' } }, app('a'), app('b', { status: 'oferta' })]
    expect(parseApplications(stored).map((item) => item.job.title)).toEqual(['Vaga a', 'Vaga b'])
    expect(parseApplications('nope')).toEqual([])
  })

  it('keeps jobs saved from a source that is no longer collected', () => {
    const saved = app('a')
    const retired = { ...saved, job: { ...saved.job, source: 'remotar' } }
    expect(parseApplications([retired]).map((item) => item.job.source)).toEqual(['remotar'])
  })

  it('warns only about saved jobs not applied to, closing within a week', () => {
    const today = new Date(2026, 9, 12)
    const items = [
      app('a', {}, '2026-10-15'),
      app('b', { status: 'candidatei' }, '2026-10-13'),
      app('c', {}, '2026-10-30'),
      app('d', {}, '2026-10-11'), // already closed
      app('e', {}, '2026-10-12'),
    ]
    expect(closingSoon(items, today).map((item) => item.job.title)).toEqual(['Vaga e', 'Vaga a'])
  })

  it('orders by stage, then the nearest deadline', () => {
    const items = [
      app('a', { status: 'processo' }),
      app('b', {}, '2026-11-01'),
      app('c', {}, '2026-10-20'),
      app('d', {}),
    ]
    expect(sortApplications(items).map((item) => item.job.title)).toEqual([
      'Vaga c',
      'Vaga b',
      'Vaga d',
      'Vaga a',
    ])
  })
})
