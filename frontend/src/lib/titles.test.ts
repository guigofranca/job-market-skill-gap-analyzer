import { describe, expect, it } from 'vitest'
import { displayTitle, isAllCaps } from './titles'

describe('displayTitle', () => {
  it.each([
    ['ANALISTA DE SUPORTE TÉCNICO JÚNIOR', 'Analista de Suporte Técnico Júnior'],
    ['ESTAGIÁRIO(A) TECNOLOGIA DA INFORMAÇÃO', 'Estagiário(a) Tecnologia da Informação'],
    ['ESTAGIÁRIO/A DE TI - SP', 'Estagiário/a de TI - SP'],
    ['ANALISTA DE DADOS JR - SQL E POWER BI', 'Analista de Dados Jr - SQL e Power BI'],
    ['TÉCNICO DE SUPORTE N1 - CRM', 'Técnico de Suporte N1 - CRM'],
    ['A VAGA DE QA', 'A Vaga de QA'],
    ['DESENVOLVEDOR PHP / DEVOPS', 'Desenvolvedor PHP / DevOps'],
    ['ANALISTA DE BANCO DE DADOS JR (DBA)', 'Analista de Banco de Dados Jr (DBA)'],
    ['SOFTWARE DEVELOPER JUNIOR - .NET', 'Software Developer Junior - .NET'],
    ['ANALISTA DE DADOS I', 'Analista de Dados I'],
    ['AUXILIAR EM T.I.', 'Auxiliar em T.I.'],
    ['ANALISTA DE MIS JR', 'Analista de MIS Jr'],
  ])('%s -> %s', (title, expected) => {
    expect(displayTitle(title)).toBe(expected)
  })

  it('leaves titles with lowercase letters as the company wrote them', () => {
    expect(displayTitle('Analista de BI JR - (Presencial)')).toBe(
      'Analista de BI JR - (Presencial)',
    )
    expect(displayTitle('INBRASP BOTUCATU - Analista Programador Jr')).toBe(
      'INBRASP BOTUCATU - Analista Programador Jr',
    )
  })

  it('needs a few letters to call a title all caps', () => {
    expect(isAllCaps('TI')).toBe(false)
    expect(isAllCaps('SUPORTE')).toBe(true)
    expect(isAllCaps('Suporte')).toBe(false)
  })
})
