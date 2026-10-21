import type { Filters } from '../../api/endpoints'
import type { Meta } from '../../api/schemas'
import { useSummary } from '../../hooks/useDashboardData'
import { Guarded } from '../feedback/Guarded'
import { KpiTiles } from './KpiTiles'
import {
  CategorySection,
  LevelComparisonSection,
  LocationsSection,
  TopSkillsSection,
  WorkplaceSection,
} from './Sections'

/**
 * The "Mercado" tab: what the filtered postings ask for, in aggregate.
 * Loaded on demand (React.lazy in App): it is the only view that needs the chart library.
 */
export function MarketView({
  filters,
  meta,
  resetKeys,
  onSelectSkill,
  onFilter,
}: {
  filters: Filters
  meta: Meta
  resetKeys: readonly unknown[]
  onSelectSkill: (slug: string) => void
  onFilter: (patch: Partial<Filters>) => void
}) {
  const summary = useSummary(filters)
  const selectedSkill = meta.skills.find((skill) => skill.slug === filters.skill)
  const selectedState = meta.states.find((state) => state.key === filters.state)

  return (
    <>
      <Guarded title="Indicadores" resetKeys={resetKeys}>
        <KpiTiles
          query={summary}
          totalJobs={meta.total_jobs}
          selectedSkillName={selectedSkill?.name}
        />
      </Guarded>

      {/* Two independent columns (not rows), paired so both stacks are about the same height;
          the last chart of each column grows into what is left, so both end together. */}
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-3">
          <Guarded title="Competências mais exigidas" resetKeys={resetKeys}>
            <TopSkillsSection
              filters={filters}
              skillName={selectedSkill?.name}
              onSelectSkill={onSelectSkill}
            />
          </Guarded>
          <Guarded title="Modalidade" resetKeys={resetKeys} className="flex flex-1 flex-col">
            <WorkplaceSection filters={filters} grow />
          </Guarded>
        </div>
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-2">
          <Guarded title="Categorias" resetKeys={resetKeys}>
            <CategorySection query={summary} />
          </Guarded>
          <Guarded
            title="Onde estão as vagas"
            resetKeys={resetKeys}
            className="flex flex-1 flex-col"
          >
            <LocationsSection
              filters={filters}
              stateName={selectedState?.label}
              onFilter={onFilter}
              grow
            />
          </Guarded>
        </div>
      </div>

      <Guarded title="Estágio × Júnior" resetKeys={resetKeys}>
        <LevelComparisonSection filters={filters} />
      </Guarded>
    </>
  )
}
