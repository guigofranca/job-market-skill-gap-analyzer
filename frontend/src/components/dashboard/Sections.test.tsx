import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LevelComparison, Meta, Trends } from '../../api/schemas'
import { useLevelComparison, useTrends } from '../../hooks/useDashboardData'
import { LevelComparisonSection, TrendsSection } from './Sections'

vi.mock('../../hooks/useDashboardData', () => ({
  useLevelComparison: vi.fn<typeof useLevelComparison>(),
  useTrends: vi.fn<typeof useTrends>(),
}))
const mockedComparison = vi.mocked(useLevelComparison)
const mockedTrends = vi.mocked(useTrends)

function loaded<T>(data: T) {
  return {
    data,
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
  }
}

const areas: Meta['areas'] = [
  { key: 'dados', label: 'Dados', count: 121 },
  { key: 'infraestrutura', label: 'Suporte e Infraestrutura', count: 326 },
  { key: 'automacao', label: 'Automação', count: 0 },
]

const comparison = (estagio: number, junior: number): LevelComparison => ({
  totals: { estagio, junior },
  items: [
    {
      slug: 'sql',
      name: 'SQL',
      category: 'linguagens',
      estagio_count: 22,
      estagio_share: 0.37,
      junior_count: 38,
      junior_share: 0.62,
    },
  ],
})

describe('LevelComparisonSection', () => {
  beforeEach(() => {
    mockedComparison.mockReset()
    mockedComparison.mockReturnValue(
      loaded(comparison(60, 61)) as unknown as ReturnType<typeof useLevelComparison>,
    )
  })

  it('compares inside the area with the most jobs, and lets you pick another', () => {
    render(<LevelComparisonSection filters={{ level: 'estagio', state: 'SP' }} areas={areas} />)
    const picker = screen.getByRole('group', { name: 'Comparar em' })
    // Areas without jobs are not offered; the largest one comes first and is selected.
    expect(
      within(picker)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Suporte e Infraestrutura', 'Dados'])
    expect(
      within(picker).getByRole('button', { name: 'Suporte e Infraestrutura' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(within(picker).getByRole('button', { name: 'Dados' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    // The level filter is ignored, the others are kept.
    expect(mockedComparison).toHaveBeenLastCalledWith({ state: 'SP', area: 'infraestrutura' }, 10)

    fireEvent.click(within(picker).getByRole('button', { name: 'Dados' }))
    expect(mockedComparison).toHaveBeenLastCalledWith({ state: 'SP', area: 'dados' }, 10)
    expect(screen.getByText(/% das 60 vagas de estágio e das 61 de júnior/)).toBeInTheDocument()
  })

  it('follows the area filter, without its own choice', () => {
    render(<LevelComparisonSection filters={{ area: 'dados' }} areas={areas} />)
    expect(screen.queryByRole('group', { name: 'Comparar em' })).not.toBeInTheDocument()
    expect(mockedComparison).toHaveBeenLastCalledWith({ area: 'dados' }, 10)
    expect(screen.getByText(/^Dados: /)).toBeInTheDocument()
  })

  it('does not compare a handful of postings', () => {
    mockedComparison.mockReturnValue(
      loaded(comparison(4, 30)) as unknown as ReturnType<typeof useLevelComparison>,
    )
    render(<LevelComparisonSection filters={{ area: 'dados' }} areas={areas} />)
    expect(screen.getByText('Poucas vagas para comparar os níveis')).toBeInTheDocument()
    expect(screen.getByText(/tem 4 de estágio e 30 de júnior/)).toBeInTheDocument()
  })
})

describe('TrendsSection', () => {
  it('waits for enough comparable days before showing a trend', () => {
    const trends: Trends = {
      days: [
        { day: '2026-10-26', jobs: 558 },
        { day: '2026-10-27', jobs: 563 },
        { day: '2026-10-28', jobs: 559 },
      ],
      skills: [],
      rising: [],
      falling: [],
      min_days: 7,
    }
    mockedTrends.mockReturnValue(loaded(trends) as unknown as ReturnType<typeof useTrends>)
    render(<TrendsSection filters={{}} />)
    expect(screen.getByText('Ainda não há dias suficientes de coleta')).toBeInTheDocument()
    expect(screen.getByText(/com 7 dias de coleta comparáveis; há 3 até agora/)).toBeInTheDocument()
    expect(screen.queryByRole('figure')).not.toBeInTheDocument()
  })
})
