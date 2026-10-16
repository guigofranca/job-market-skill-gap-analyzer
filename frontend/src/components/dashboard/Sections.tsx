import type { UseQueryResult } from '@tanstack/react-query'
import type { Filters } from '../../api/endpoints'
import type { Summary } from '../../api/schemas'
import {
  useLevelComparison,
  useLocations,
  useTopSkills,
  useWorkplaces,
} from '../../hooks/useDashboardData'
import { formatNumber, formatPercent } from '../../lib/format'
import { CATEGORY_LABELS, WORKPLACE_LABELS } from '../../lib/labels'
import { LevelComparisonChart } from '../charts/LevelComparisonChart'
import { WorkplaceChart } from '../charts/WorkplaceChart'
import { HorizontalBarChart } from '../charts/TopSkillsChart'
import { Legend } from '../charts/ChartTooltip'
import { LEVEL_SERIES, skillsToBars, WORKPLACE_SERIES } from '../charts/chartData'
import { ChartCard, DataTable } from './ChartCard'

const percentColumns = [
  { key: 'label', label: 'Competência' },
  { key: 'category', label: 'Categoria' },
  { key: 'count', label: 'Vagas', align: 'right' },
  { key: 'share', label: '% das vagas', align: 'right' },
] as const

export function TopSkillsSection({
  filters,
  skillName,
  onSelectSkill,
}: {
  filters: Filters
  skillName: string | undefined
  onSelectSkill: (slug: string) => void
}) {
  const query = useTopSkills(filters, 15)
  const items = query.data?.items ?? []
  const bars = skillsToBars(items)

  return (
    <ChartCard
      title={
        skillName ? `Competências pedidas junto com ${skillName}` : 'Competências mais exigidas'
      }
      subtitle="% das vagas filtradas que exigem cada competência (diferenciais não contam) · clique numa barra para filtrar"
      query={query}
      isEmpty={items.length === 0}
      loadingHeight={480}
      table={
        <DataTable
          caption="Competências mais exigidas"
          columns={percentColumns}
          rows={bars.map((bar) => ({
            label: bar.label,
            category: bar.detail,
            count: formatNumber(bar.count),
            share: formatPercent(bar.share),
          }))}
        />
      }
    >
      <HorizontalBarChart
        data={bars}
        totalJobs={query.data?.total_jobs ?? 0}
        ariaLabel="Ranking das competências mais citadas nas vagas"
        onSelect={onSelectSkill}
      />
    </ChartCard>
  )
}

export function CategorySection({ query }: { query: UseQueryResult<Summary> }) {
  const categories = [...(query.data?.by_category ?? [])]
    .filter((category) => category.count > 0)
    .sort((a, b) => b.share - a.share)
  const bars = categories.map((category) => ({
    key: category.category,
    label: CATEGORY_LABELS[category.category],
    share: category.share,
    count: category.count,
  }))

  return (
    <ChartCard
      title="Categorias de competência"
      subtitle="% das vagas que pedem ao menos uma competência da categoria"
      query={query}
      isEmpty={bars.length === 0}
      table={
        <DataTable
          caption="Categorias de competência"
          columns={[
            { key: 'label', label: 'Categoria' },
            { key: 'count', label: 'Vagas', align: 'right' },
            { key: 'share', label: '% das vagas', align: 'right' },
          ]}
          rows={bars.map((bar) => ({
            label: bar.label,
            count: formatNumber(bar.count),
            share: formatPercent(bar.share),
          }))}
        />
      }
    >
      <HorizontalBarChart
        data={bars}
        totalJobs={query.data?.total_jobs ?? 0}
        ariaLabel="Participação de cada categoria de competência nas vagas"
        labelWidth={150}
      />
    </ChartCard>
  )
}

export function LevelComparisonSection({ filters }: { filters: Filters }) {
  const { level: _ignored, ...scope } = filters
  const query = useLevelComparison(scope, 10)
  const data = query.data
  const totals = data?.totals

  return (
    <ChartCard
      title="Estágio × Júnior: o que muda"
      subtitle={
        totals
          ? `Participação nas vagas de cada nível (${formatNumber(totals.estagio)} de estágio, ${formatNumber(totals.junior)} júnior) · ignora o filtro de nível`
          : 'Participação nas vagas de cada nível · ignora o filtro de nível'
      }
      query={query}
      isEmpty={!data || data.items.length === 0}
      loadingHeight={420}
      legend={
        <Legend
          shape="rect"
          items={LEVEL_SERIES.map((series) => ({
            key: series.key,
            label: series.label,
            color: series.color,
          }))}
        />
      }
      table={
        data && (
          <DataTable
            caption="Comparação entre Estágio e Júnior"
            columns={[
              { key: 'name', label: 'Competência' },
              { key: 'estagio', label: 'Estágio', align: 'right' },
              { key: 'junior', label: 'Júnior', align: 'right' },
            ]}
            rows={data.items.map((item) => ({
              name: item.name,
              estagio: formatPercent(item.estagio_share),
              junior: formatPercent(item.junior_share),
            }))}
          />
        )
      }
    >
      {data && <LevelComparisonChart data={data} />}
    </ChartCard>
  )
}

export function WorkplaceSection({ filters, grow = false }: { filters: Filters; grow?: boolean }) {
  const { area: _area, workplace: _workplace, ...scope } = filters
  const query = useWorkplaces(scope)
  const items = query.data?.items ?? []
  const unknown = items[0]?.unknown ?? 0

  return (
    <ChartCard
      title="Remoto, híbrido ou presencial?"
      subtitle={`Modalidade das vagas de cada área${unknown > 0 ? ` (${formatNumber(unknown)} não informam)` : ''} · ignora os filtros de área e modalidade`}
      query={query}
      isEmpty={items.length === 0}
      loadingHeight={300}
      grow={grow}
      legend={
        <Legend
          shape="rect"
          items={WORKPLACE_SERIES.map((series) => ({
            key: series.key,
            label: WORKPLACE_LABELS[series.key],
            color: series.color,
          }))}
        />
      }
      table={
        <DataTable
          caption="Modalidade de trabalho por área"
          columns={[
            { key: 'label', label: 'Área' },
            ...WORKPLACE_SERIES.map((series) => ({
              key: series.key,
              label: WORKPLACE_LABELS[series.key],
              align: 'right' as const,
            })),
            { key: 'total', label: 'Vagas', align: 'right' },
          ]}
          rows={items.map((row) => ({
            label: row.label,
            ...Object.fromEntries(
              row.workplaces.map((item) => [
                item.key,
                `${formatPercent(item.share)} (${formatNumber(item.count)})`,
              ]),
            ),
            total: formatNumber(row.total),
          }))}
        />
      }
    >
      {query.data && <WorkplaceChart data={query.data} grow={grow} />}
    </ChartCard>
  )
}

/** Bars in the chart; the table view lists up to 30. */
const LOCATION_BARS = 10

export function LocationsSection({
  filters,
  stateName,
  onFilter,
  grow = false,
}: {
  filters: Filters
  stateName: string | undefined
  onFilter: (patch: Partial<Filters>) => void
  grow?: boolean
}) {
  const { city: _ignored, ...scope } = filters
  const query = useLocations(scope)
  const data = query.data
  const byCity = data?.kind === 'city'
  const bars = (data?.items ?? []).map((item) => ({
    key: item.key,
    label: item.label,
    share: item.share,
    count: item.count,
  }))
  const unlocated =
    data && data.unlocated > 0
      ? byCity
        ? ` · ${formatNumber(data.unlocated)} sem cidade informada`
        : ` · ${formatNumber(data.unlocated)} sem estado (em geral remotas)`
      : ''

  return (
    <ChartCard
      title={byCity && stateName ? `Cidades em ${stateName}` : 'Onde estão as vagas'}
      subtitle={
        <>
          % das vagas filtradas · clique {byCity ? 'numa cidade' : 'num estado'} para filtrar
          {unlocated}
          {byCity && (
            <>
              {' · '}
              <button
                type="button"
                className="text-accent hover:text-ink underline transition-colors"
                onClick={() => onFilter({ state: undefined, city: undefined })}
              >
                ver todos os estados
              </button>
            </>
          )}
        </>
      }
      query={query}
      isEmpty={bars.length === 0}
      {...(byCity && { emptyTitle: 'Nenhuma vaga com cidade informada' })}
      loadingHeight={340}
      grow={grow}
      table={
        <DataTable
          caption={byCity ? 'Vagas por cidade' : 'Vagas por estado'}
          columns={[
            { key: 'label', label: byCity ? 'Cidade' : 'Estado' },
            { key: 'count', label: 'Vagas', align: 'right' },
            { key: 'share', label: '% das vagas', align: 'right' },
          ]}
          rows={bars.map((bar) => ({
            label: bar.label,
            count: formatNumber(bar.count),
            share: formatPercent(bar.share),
          }))}
        />
      }
    >
      <HorizontalBarChart
        data={bars.slice(0, LOCATION_BARS)}
        totalJobs={data?.total_jobs ?? 0}
        ariaLabel={
          byCity ? 'Ranking das cidades com mais vagas' : 'Ranking dos estados com mais vagas'
        }
        onSelect={(key) =>
          // A state click also drops a city from another state (as the filter bar does).
          onFilter(byCity ? { city: key } : { state: key, city: undefined })
        }
        labelWidth={128}
        grow={grow}
      />
    </ChartCard>
  )
}
