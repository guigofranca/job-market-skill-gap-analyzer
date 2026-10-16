import { describe, expect, it } from 'vitest'
import type { Job } from '../api/schemas'
import { daysUntil, formatDeadline, formatRelativeTime, formatSalary, isStale } from './format'
import { jobTags } from './jobTags'

// Intl inserts a non-breaking space after "R$"; normalise it for readable assertions.
const plain = (text: string | null | undefined) => text?.replace(/\s/g, ' ')

describe('formatSalary', () => {
  it.each([
    [1837, 1837, 'R$ 1.837'],
    [1200, 1590, 'R$ 1.200 – R$ 1.590'],
    [2000, null, 'a partir de R$ 2.000'],
    [null, 3000, 'até R$ 3.000'],
  ])('%s – %s -> %s', (min, max, expected) => {
    expect(plain(formatSalary(min, max))).toBe(expected)
  })

  it('returns null when nothing is informed', () => {
    expect(formatSalary(null, null)).toBeNull()
  })
})

describe('formatDeadline', () => {
  const today = new Date(2026, 9, 12) // 12/10/2026, local time

  it('counts calendar days, not hours', () => {
    expect(daysUntil('2026-10-12', today)).toBe(0)
    expect(daysUntil('2026-10-15', today)).toBe(3)
    expect(daysUntil('2026-10-11', today)).toBe(-1)
  })

  it.each([
    ['2026-10-12', 'Encerra hoje', true],
    ['2026-10-13', 'Encerra amanhã', true],
    ['2026-10-15', 'Encerra em 3 dias', true],
    ['2026-10-20', 'Inscrições até 20/10', false],
  ])('%s -> %s', (iso, label, soon) => {
    expect(formatDeadline(iso, today)).toEqual({ label, soon })
  })

  it('hides past deadlines', () => {
    expect(formatDeadline('2026-10-11', today)).toBeNull()
  })
})

describe('jobTags with deadline and salary', () => {
  it('puts news, urgency and pay first', () => {
    const job = {
      deadline: '2026-10-13',
      salary_min: 1500,
      salary_max: 1500,
      workplace: 'remoto',
      contracts: ['estagio'],
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
    const tags = jobTags(job, { today: new Date(2026, 9, 12), isNew: true })
    expect(tags.map((tag) => plain(tag.label))).toEqual([
      'Nova para você',
      'Encerra amanhã',
      'R$ 1.500/mês',
      'Remoto',
      'Estágio',
    ])
    expect(tags[1]?.highlight).toBe(true)
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-12T12:00:00Z')

  it.each([
    ['2026-10-12T11:58:00Z', 'agora há pouco'],
    ['2026-10-12T11:30:00Z', 'há 30 minutos'],
    ['2026-10-12T09:00:00Z', 'há 3 horas'],
    ['2026-10-11T10:00:00Z', 'ontem'],
    ['2026-10-07T12:00:00Z', 'há 5 dias'],
  ])('%s -> %s', (iso, expected) => {
    expect(formatRelativeTime(iso, now)).toBe(expected)
  })

  it('flags data older than three days', () => {
    expect(isStale('2026-10-10T12:00:00Z', now)).toBe(false)
    expect(isStale('2026-10-08T12:00:00Z', now)).toBe(true)
  })
})
