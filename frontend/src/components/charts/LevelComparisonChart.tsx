import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { LevelComparison } from '../../api/schemas'
import { formatNumber, formatPercent } from '../../lib/format'
import { TooltipBox, TooltipRow } from './ChartTooltip'
import {
  activeRow,
  AXIS_TICK,
  CATEGORY_TICK,
  LEVEL_SERIES,
  shareAxis,
  type LevelComparisonItem,
  type TooltipState,
} from './chartData'

/** Two series (Estágio vs Júnior) as grouped bars with a 2px gap between neighbours. */
export function LevelComparisonChart({ data }: { data: LevelComparison }) {
  const height = data.items.length * 40 + 32
  const { domainMax, ticks } = shareAxis(
    Math.max(...data.items.flatMap((item) => [item.estagio_share, item.junior_share]), 0.05),
  )
  return (
    <figure
      aria-label="Participação de cada competência nas vagas de Estágio e de Júnior"
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={[...data.items]}
          layout="vertical"
          margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
          barGap={2}
          barCategoryGap={8}
        >
          <CartesianGrid horizontal={false} stroke="var(--grid)" />
          <XAxis
            type="number"
            domain={[0, domainMax]}
            ticks={ticks}
            tickFormatter={formatPercent}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={124}
            tick={CATEGORY_TICK}
            axisLine={{ stroke: 'var(--axis)' }}
            tickLine={false}
            interval={0}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={({ active, payload }) => (
              <ComparisonTooltip active={active} payload={payload} totals={data.totals} />
            )}
          />
          {LEVEL_SERIES.map((series) => (
            <Bar
              key={series.key}
              dataKey={`${series.key}_share`}
              name={series.label}
              fill={series.color}
              radius={[0, 4, 4, 0]}
              maxBarSize={12}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}

function ComparisonTooltip({
  active,
  payload,
  totals,
}: TooltipState & { totals: LevelComparison['totals'] }) {
  const item = activeRow<LevelComparisonItem>({ active, payload })
  if (!item) return null
  return (
    <TooltipBox title={item.name}>
      <TooltipRow
        color={LEVEL_SERIES[0].color}
        value={formatPercent(item.estagio_share)}
        label="Estágio"
        detail={`${formatNumber(item.estagio_count)} de ${formatNumber(totals.estagio)}`}
      />
      <TooltipRow
        color={LEVEL_SERIES[1].color}
        value={formatPercent(item.junior_share)}
        label="Júnior"
        detail={`${formatNumber(item.junior_count)} de ${formatNumber(totals.junior)}`}
      />
    </TooltipBox>
  )
}
