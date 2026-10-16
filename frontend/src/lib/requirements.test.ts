import { describe, expect, it } from 'vitest'
import type { Requirements } from '../api/schemas'
import { requirementTags } from './requirements'

const none: Requirements = {
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
}

describe('requirementTags', () => {
  it('describes what the posting asks of candidates', () => {
    const req: Requirements = {
      ...none,
      weekly_hours: 30,
      english: 'exigido',
      english_level: 'intermediario',
      min_semester: 4,
      max_semester: 7,
      graduation_from: '2028-06',
      graduation_to: '2028-12',
    }
    expect(requirementTags(req).map((tag) => tag.label)).toEqual([
      '30h/semana',
      'Inglês intermediário',
      'Do 4º ao 7º semestre',
      'Formatura entre 06/2028 e 12/2028',
    ])
  })

  it('marks English listed only as a plus', () => {
    const req: Requirements = { ...none, english: 'diferencial', english_level: null }
    expect(requirementTags(req).map((tag) => tag.label)).toEqual(['Inglês (diferencial)'])
  })

  it('is empty when the posting states nothing', () => {
    expect(requirementTags(none)).toEqual([])
  })
})
