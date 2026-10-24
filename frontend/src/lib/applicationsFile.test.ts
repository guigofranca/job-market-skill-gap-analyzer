import { describe, expect, it } from 'vitest'
import type { Application } from './applications'
import {
  exportApplications,
  ImportError,
  mergeApplications,
  parseApplicationsFile,
} from './applicationsFile'

function app(id: string, overrides: Partial<Application> = {}): Application {
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
      deadline: null,
    },
    status: 'salva',
    note: '',
    savedAt: '2026-10-01T12:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('applications file', () => {
  it('round-trips an export', () => {
    const items = [app('a'), app('b', { status: 'processo', note: 'entrevista dia 20' })]
    expect(parseApplicationsFile(exportApplications(items))).toEqual(items)
  })

  it('rejects other files with a message the visitor can act on', () => {
    expect(() => parseApplicationsFile('not json')).toThrow(ImportError)
    expect(() => parseApplicationsFile('{"applications": []}')).toThrow(/exportado por este painel/)
    const empty = JSON.stringify({ format: 'skill-gap-applications', applications: [{ x: 1 }] })
    expect(() => parseApplicationsFile(empty)).toThrow(/Nenhuma candidatura válida/)
  })

  it('drops invalid entries instead of trusting the file', () => {
    const file = JSON.parse(exportApplications([app('a')])) as { applications: unknown[] }
    file.applications.push({ job: { id: 'x', url: 'javascript:alert(1)' } })
    expect(parseApplicationsFile(JSON.stringify(file))).toHaveLength(1)
  })

  it('merges by job, keeping the most recently updated entry', () => {
    const current = [
      app('a'),
      app('b', { status: 'candidatei', updatedAt: '2026-10-05T00:00:00.000Z' }),
    ]
    const imported = [
      app('a', { status: 'oferta', updatedAt: '2026-10-09T00:00:00.000Z' }),
      app('b', { status: 'salva' }),
      app('c'),
    ]
    const merged = mergeApplications(current, imported)
    expect(merged).toMatchObject({ added: 1, updated: 1 })
    expect(merged.applications.map((item) => [item.job.title, item.status])).toEqual([
      ['Vaga a', 'oferta'],
      ['Vaga b', 'candidatei'],
      ['Vaga c', 'salva'],
    ])
  })
})
