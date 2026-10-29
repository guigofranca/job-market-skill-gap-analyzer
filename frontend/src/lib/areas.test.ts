import { describe, expect, it } from 'vitest'
import { areasWithJobs } from './areas'

describe('areasWithJobs', () => {
  it('keeps the known areas with jobs, most jobs first, with their labels', () => {
    const areas = areasWithJobs([
      { key: 'dados', count: 121 },
      { key: 'automacao', count: 0 },
      { key: 'infraestrutura', count: 326 },
      { key: 'marketing', count: 50 },
    ])
    expect(areas).toEqual([
      { key: 'infraestrutura', label: 'Suporte e Infraestrutura', count: 326 },
      { key: 'dados', label: 'Dados', count: 121 },
    ])
  })
})
