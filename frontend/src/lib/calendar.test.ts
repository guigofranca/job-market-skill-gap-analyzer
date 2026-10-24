import { describe, expect, it } from 'vitest'
import type { Application } from './applications'
import { deadlinesCalendar, withDeadline } from './calendar'

function app(id: string, deadline: string | null, overrides: Partial<Application> = {}) {
  return {
    job: {
      id: id.repeat(16).slice(0, 16),
      title: 'ANALISTA DE DADOS JR',
      company: 'ACME, Inc; Brasil',
      location: 'Recife, PE',
      url: 'https://acme.gupy.io/job/1',
      level: 'junior',
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

const now = new Date('2026-10-20T12:00:00Z')

describe('deadlinesCalendar', () => {
  it('makes an all-day event per deadline, with a reminder the day before', () => {
    // Unfolded: long lines continue on the next one, after a space.
    const ics = deadlinesCalendar([app('a', '2026-10-31')], now).replaceAll('\r\n ', '')
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('DTSTART;VALUE=DATE:20261031\r\n')
    expect(ics).toContain('DTEND;VALUE=DATE:20261101\r\n')
    expect(ics).toContain('DTSTAMP:20261020T120000Z\r\n')
    expect(ics).toContain('UID:aaaaaaaaaaaaaaaa@skill-gap-analyzer\r\n')
    expect(ics).toContain('TRIGGER:-P1D')
    // Escaped text, and the title shown as in the dashboard.
    expect(ics).toContain(String.raw`SUMMARY:Prazo: Analista de Dados Jr (ACME\, Inc\; Brasil)`)
  })

  it('leaves out jobs without a deadline and the ones the visitor closed', () => {
    const items = [
      app('a', null),
      app('b', '2026-10-31', { status: 'encerrada' }),
      app('c', '2026-11-02'),
    ]
    expect(withDeadline(items).map((item) => item.job.id[0])).toEqual(['c'])
    expect(deadlinesCalendar(items, now).match(/BEGIN:VEVENT/g)).toHaveLength(1)
  })

  it('folds lines longer than 75 octets', () => {
    const long = app('a', '2026-10-31', { note: 'á'.repeat(100) })
    const lines = deadlinesCalendar([long], now).split('\r\n')
    const encoder = new TextEncoder()
    expect(Math.max(...lines.map((line) => encoder.encode(line).length))).toBeLessThanOrEqual(75)
    expect(lines.some((line) => line.startsWith(' '))).toBe(true)
  })
})
