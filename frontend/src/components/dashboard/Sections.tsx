import { TrendingDown, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import type { Filters } from '../../api/endpoints'
import type { Area, Meta, SkillTrend } from '../../api/schemas'
import {
  useLevelComparison,
  useLocations,
  useTopSkills,
  useTrends,
  useWorkplaces,
} from '../../hooks/useDashboardData'
import { useSkillColors } from '../../hooks/useSkillColors'
import { areasWithJobs, type AreaCount } from '../../lib/areas'
import { formatDate, formatNumber, formatPercent, formatPoints } from '../../lib/format'
import { AREA_LABELS, WORKPLACE_LABELS } from '../../lib/labels'
import { LevelComparisonChart } from '../charts/LevelComparisonChart'
import { WorkplaceChart } from '../charts/WorkplaceChart'
import { HorizontalBarChart } from '../charts/TopSkillsChart'
import { JobsPerDayChart, SkillTrendChart } from '../charts/TrendCharts'
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

/** Fewer postings of either level than this: their shares would swing with each posting. */
const MIN_LEVEL_JOBS = 10

/**
 * Estágio and Júnior compared inside one area. The levels have different area mixes (most Júnior
 * postings are support), so across areas the bars would mostly show that mix, not the level: in
 * Dados, Júnior asks for SQL far more than Estágio, while all areas together say the opposite.
 * The area filter decides the area; without it the card offers its own choice, starting on the
 * area with the most jobs.
 */
export function LevelComparisonSection({
  filters,
  areas: options,
}: {
  filters: Filters
  areas: Meta['areas']
}) {
  const areas = areasWithJobs(options)
  const [picked, setPicked] = useState<Area | undefined>(undefined)
  const area = filters.area ?? picked ?? areas[0]?.key
  const areaLabel = area && AREA_LABELS[area]
  const { level: _ignored, ...scope } = filters
  const query = useLevelComparison({ ...scope, area }, 10)
  const data = query.data
  const totals = data?.totals
  const tooFew = totals !== undefined && Math.min(totals.estagio, totals.junior) < MIN_LEVEL_JOBS

  return (
    <ChartCard
      title="Estágio × Júnior: o que muda"
      subtitle={
        totals && areaLabel
          ? `${areaLabel}: % das ${formatNumber(totals.estagio)} vagas de estágio e das ${formatNumber(totals.junior)} de júnior que pedem cada competência · ignora o filtro de nível`
          : '% das vagas de cada nível que pedem cada competência · ignora o filtro de nível'
      }
      toolbar={
        !filters.area &&
        areas.length > 1 && <AreaPicker areas={areas} value={area} onChange={setPicked} />
      }
      query={query}
      isEmpty={!data || data.items.length === 0 || tooFew}
      {...(tooFew &&
        totals && {
          emptyTitle: 'Poucas vagas para comparar os níveis',
          emptyHint: `${areaLabel ?? 'Esta área'} tem ${formatNumber(totals.estagio)} de estágio e ${formatNumber(totals.junior)} de júnior com esses filtros; a comparação precisa de ao menos ${MIN_LEVEL_JOBS} de cada.`,
        })}
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

/** The area to compare in, as a segmented control (same look as the chart / table toggle). */
function AreaPicker({
  areas,
  value,
  onChange,
}: {
  areas: readonly AreaCount[]
  value: Area | undefined
  onChange: (area: Area) => void
}) {
  return (
    // The legend names the group for screen readers; the span shows it inline (a legend does not
    // take part in a flex row).
    <fieldset className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
      <legend className="sr-only">Comparar em</legend>
      <span aria-hidden className="text-muted text-xs">
        Comparar em
      </span>
      <div className="border-line bg-surface-2 flex flex-wrap rounded-lg border p-0.5">
        {areas.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={item.key === value}
            onClick={() => onChange(item.key)}
            className="segment px-2.5 py-1 text-xs"
          >
            {item.label}
          </button>
        ))}
      </div>
    </fieldset>
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

/**
 * How demand moves from one collection day to the next. The daily history is kept by level and
 * area only, so the other filters do not apply here (the subtitle says so).
 */
export function TrendsSection({ filters }: { filters: Filters }) {
  const query = useTrends({ level: filters.level, area: filters.area })
  const data = query.data
  const colors = useSkillColors(data?.skills.map((skill) => skill.slug) ?? [])
  const first = data?.days[0]?.day
  const last = data?.days.at(-1)?.day
  // A few comparable days only show jobs coming and going: no trend until the API's minimum.
  const collected = data?.days.length ?? 0
  const minDays = data?.min_days ?? 7
  const ignored = [
    filters.state,
    filters.city,
    filters.workplace,
    filters.inclusion,
    filters.skill,
  ].some(Boolean)

  return (
    <ChartCard
      title="Tendência: o que está subindo e caindo"
      subtitle={`% das vagas que pedem cada competência, por dia de coleta${first && last ? ` (${formatDate(first)} a ${formatDate(last)})` : ''} · considera só nível e área${ignored ? ' (os outros filtros não se aplicam aqui)' : ''}`}
      query={query}
      isEmpty={collected < minDays}
      emptyTitle="Ainda não há dias suficientes de coleta"
      emptyHint={`A tendência aparece com ${formatNumber(minDays)} dias de coleta comparáveis; ${collected === 1 ? 'há 1 até agora' : `há ${formatNumber(collected)} até agora`}. Antes disso, a variação de um dia para o outro é só vaga entrando e saindo.`}
      loadingHeight={300}
      legend={
        data && (
          <Legend
            items={data.skills.map((skill) => ({
              key: skill.slug,
              label: skill.name,
              color: colors.get(skill.slug) ?? 'var(--axis-text)',
            }))}
          />
        )
      }
      table={
        data && (
          <DataTable
            caption="Participação das competências no primeiro e no último dia"
            columns={[
              { key: 'name', label: 'Competência' },
              { key: 'first', label: first ? formatDate(first) : 'Início', align: 'right' },
              { key: 'last', label: last ? formatDate(last) : 'Fim', align: 'right' },
              { key: 'change', label: 'Variação', align: 'right' },
            ]}
            rows={[...data.skills, ...data.rising, ...data.falling]
              .filter((skill, index, all) => all.findIndex((s) => s.slug === skill.slug) === index)
              .map((skill) => ({
                name: skill.name,
                first: formatPercent(skill.points[0]?.share ?? 0),
                last: formatPercent(skill.points.at(-1)?.share ?? 0),
                change: formatPoints(skill.change),
              }))}
          />
        )
      }
    >
      {data && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <SkillTrendChart data={data} colors={colors} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <div>
              <h3 className="text-ink-2 text-sm font-medium">Vagas abertas por dia</h3>
              <JobsPerDayChart data={data} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Movers title="Em alta" icon="up" items={data.rising} />
              <Movers title="Em queda" icon="down" items={data.falling} />
            </div>
          </div>
        </div>
      )}
    </ChartCard>
  )
}

/** Biggest changes of share since the first day: text in ink, the arrow carries the direction. */
function Movers({
  title,
  icon,
  items,
}: {
  title: string
  icon: 'up' | 'down'
  items: readonly SkillTrend[]
}) {
  const Icon = icon === 'up' ? TrendingUp : TrendingDown
  return (
    <section aria-label={title} className="min-w-0">
      <h3 className="text-ink-2 flex items-center gap-1 text-sm font-medium">
        <Icon aria-hidden className="text-muted size-4" />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-muted mt-1 text-xs">Nenhuma mudança relevante ainda.</p>
      ) : (
        <ol className="mt-1 flex flex-col gap-0.5 text-xs">
          {items.slice(0, 4).map((skill) => (
            <li key={skill.slug} className="flex items-baseline justify-between gap-2">
              <span className="text-ink truncate">{skill.name}</span>
              <span className="text-ink-2 shrink-0 tabular-nums">{formatPoints(skill.change)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
