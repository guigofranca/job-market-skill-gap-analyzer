import { Layers } from 'lucide-react'
import type { Filters } from '../../api/endpoints'
import type { Meta, Summary } from '../../api/schemas'
import { useSummary } from '../../hooks/useDashboardData'
import { areasWithJobs } from '../../lib/areas'
import { formatNumber, formatPercent } from '../../lib/format'
import { Guarded } from '../feedback/Guarded'
import { KpiTiles } from './KpiTiles'
import {
  LevelComparisonSection,
  LocationsSection,
  TopSkillsSection,
  TrendsSection,
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

      {!filters.area && summary.data && <AreaNotice summary={summary.data} />}

      {/* The ranking and the map side by side: the shorter card grows to the row's height. */}
      <div className="grid gap-5 lg:grid-cols-5">
        <Guarded title="Competências mais exigidas" resetKeys={resetKeys} className="lg:col-span-3">
          <TopSkillsSection
            filters={filters}
            skillName={selectedSkill?.name}
            onSelectSkill={onSelectSkill}
          />
        </Guarded>
        <Guarded
          title="Onde estão as vagas"
          resetKeys={resetKeys}
          className="flex flex-col lg:col-span-2"
        >
          <LocationsSection
            filters={filters}
            stateName={selectedState?.label}
            onFilter={onFilter}
            grow
          />
        </Guarded>
      </div>

      <Guarded title="Modalidade" resetKeys={resetKeys}>
        <WorkplaceSection filters={filters} />
      </Guarded>

      <Guarded title="Estágio × Júnior" resetKeys={resetKeys}>
        <LevelComparisonSection filters={filters} areas={meta.areas} />
      </Guarded>

      <Guarded title="Tendência" resetKeys={resetKeys}>
        <TrendsSection filters={filters} />
      </Guarded>
    </>
  )
}

/**
 * Without an area, every number mixes four areas that ask for very different skills, and the
 * biggest one leads the rankings. Says so and points to the Área filter, the one control for it
 * (it shows the choice, is shared with the Vagas tab and goes into the link).
 */
function AreaNotice({ summary }: { summary: Summary }) {
  const areas = areasWithJobs(summary.by_area)
  const [largest] = areas
  if (!largest || areas.length < 2 || summary.total_jobs === 0) return null

  return (
    <aside aria-label="Áreas misturadas" className="card p-4">
      <p className="text-ink-2 flex gap-2 text-sm">
        <Layers aria-hidden className="text-accent mt-0.5 size-4 shrink-0" />
        <span>
          Estas vagas misturam {formatNumber(areas.length)} áreas, que pedem competências bem
          diferentes: {formatPercent(largest.count / summary.total_jobs)} são de{' '}
          <strong className="text-ink font-medium">{largest.label}</strong>. Escolha uma área nos
          filtros acima para ver o que ela pede.
        </span>
      </p>
    </aside>
  )
}
