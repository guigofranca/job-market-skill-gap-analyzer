import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Meta, Summary } from '../../api/schemas'
import * as data from '../../hooks/useDashboardData'
import { MarketView } from './MarketView'

vi.mock('../../hooks/useDashboardData', () => ({
  useSummary: vi.fn<typeof data.useSummary>(),
  useTopSkills: vi.fn<typeof data.useTopSkills>(),
  useLocations: vi.fn<typeof data.useLocations>(),
  useWorkplaces: vi.fn<typeof data.useWorkplaces>(),
  useLevelComparison: vi.fn<typeof data.useLevelComparison>(),
  useTrends: vi.fn<typeof data.useTrends>(),
}))

const summary = {
  total_jobs: 559,
  distinct_skills: 100,
  avg_skills_per_job: 3.49,
  jobs_without_skills: 88,
  top_skill: null,
  by_level: [],
  by_area: [
    { key: 'dados', label: 'Dados', count: 121 },
    { key: 'automacao', label: 'Automação', count: 37 },
    { key: 'desenvolvimento', label: 'Desenvolvimento', count: 75 },
    { key: 'infraestrutura', label: 'Suporte e Infraestrutura', count: 326 },
  ],
  by_source: [],
  by_category: [],
} satisfies Summary

const meta = {
  total_jobs: 559,
  skills: [],
  states: [],
  areas: summary.by_area,
} as unknown as Meta

beforeEach(() => {
  vi.mocked(data.useSummary).mockReturnValue({
    data: summary,
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
  } as unknown as ReturnType<typeof data.useSummary>)
  const pending = { isPending: true, isError: false, isFetching: true, isPlaceholderData: false }
  for (const hook of [
    data.useTopSkills,
    data.useLocations,
    data.useWorkplaces,
    data.useLevelComparison,
    data.useTrends,
  ]) {
    vi.mocked(hook).mockReturnValue(pending as never)
  }
})

describe('MarketView', () => {
  it('says the areas are mixed and points to the area filter', () => {
    render(
      <MarketView
        filters={{}}
        meta={meta}
        resetKeys={[]}
        onSelectSkill={vi.fn<(slug: string) => void>()}
        onFilter={vi.fn<(patch: object) => void>()}
      />,
    )
    const notice = screen.getByRole('complementary', { name: 'Áreas misturadas' })
    expect(notice).toHaveTextContent('Estas vagas misturam 4 áreas')
    expect(notice).toHaveTextContent('58% são de Suporte e Infraestrutura')
    expect(notice).toHaveTextContent('Escolha uma área nos filtros acima')
    // The Área filter is the one control for it: no second set of buttons here.
    expect(within(notice).queryAllByRole('button')).toEqual([])
  })

  it('has no notice once an area is chosen, nor the categories chart', () => {
    render(
      <MarketView
        filters={{ area: 'dados' }}
        meta={meta}
        resetKeys={[]}
        onSelectSkill={vi.fn<(slug: string) => void>()}
        onFilter={vi.fn<(patch: object) => void>()}
      />,
    )
    expect(screen.queryByRole('complementary', { name: 'Áreas misturadas' })).toBeNull()
    expect(screen.queryByText('Categorias de competência')).toBeNull()
  })
})
