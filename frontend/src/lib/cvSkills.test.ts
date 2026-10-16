import { describe, expect, it } from 'vitest'
import { compilePatterns, extractSkills, matchingForm } from './cvSkills'

const patterns = compilePatterns({
  items: [
    { slug: 'python', pattern: /\bpython\b/.source, ignore_case: true },
    { slug: 'power-bi', pattern: /\bpower\s?bi\b/.source, ignore_case: true },
    { slug: 'statistics', pattern: /\bestatistica\b/.source, ignore_case: true },
    { slug: 'ai', pattern: /\bIA\b/.source, ignore_case: false },
    { slug: 'broken', pattern: '(?<bad', ignore_case: true },
  ],
})

describe('cv skills', () => {
  it('normalises text like the backend', () => {
    expect(matchingForm('Estatística e Programação')).toBe('Estatistica e Programacao')
  })

  it('skips patterns this engine cannot compile', () => {
    expect(patterns.map((item) => item.slug)).toEqual(['python', 'power-bi', 'statistics', 'ai'])
  })

  it('finds skills regardless of accents and case, keeping case-sensitive rules strict', () => {
    const cv = 'Projetos com PYTHON e PowerBI. Disciplina de Estatística. Estudo IA generativa.'
    expect(extractSkills(cv, patterns)).toEqual(['python', 'power-bi', 'statistics', 'ai'])
    expect(extractSkills('Ele ia ao escritório', patterns)).toEqual([])
  })
})
