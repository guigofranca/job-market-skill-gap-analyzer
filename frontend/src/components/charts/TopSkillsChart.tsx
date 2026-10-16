import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatNumber, formatPercent } from '../../lib/format'
import { TooltipBox, TooltipRow } from './ChartTooltip'
import {
  activeRow,
  AXIS_TICK,
  CATEGORY_TICK,
  shareAxis,
  type HorizontalBarDatum,
  type TooltipState,
} from './chartData'

const ROW_HEIGHT = 30
const AXIS_BAND = 32

/** Single-series ranked bars: one color for every bar (length already encodes the value). */
export function HorizontalBarChart({
  data,
  totalJobs,
  ariaLabel,
  onSelect,
  labelWidth = 136,
  grow = false,
}: {
  data: readonly HorizontalBarDatum[]
  totalJobs: number
  ariaLabel: string
  onSelect?: (key: string) => void
  labelWidth?: number
  /** Take any extra height of a flex column: rows spread out, bars keep their thickness. */
  grow?: boolean
}) {
  const { domainMax, ticks } = shareAxis(Math.max(...data.map((item) => item.share), 0.05))

  const height = data.length * ROW_HEIGHT + AXIS_BAND

  return (
    <figure
      aria-label={ariaLabel}
      className={grow ? 'relative flex-1' : undefined}
      style={grow ? { minHeight: height } : { height }}
    >
      {/* Absolutely positioned when growing, so the chart measures the stretched figure. */}
      <div className={grow ? 'absolute inset-0' : 'h-full'}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={[...data]}
            layout="vertical"
            margin={{ top: 0, right: 44, bottom: 0, left: 0 }}
            barCategoryGap={6}
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
              dataKey="label"
              width={labelWidth}
              tick={CATEGORY_TICK}
              axisLine={{ stroke: 'var(--axis)' }}
              tickLine={false}
              interval={0}
            />
            <Tooltip
              cursor={{ fill: 'var(--surface-2)' }}
              content={({ active, payload }) => (
                <BarTooltip active={active} payload={payload} totalJobs={totalJobs} />
              )}
            />
            <Bar
              dataKey="share"
              fill="var(--series-1)"
              radius={[0, 4, 4, 0]}
              maxBarSize={18}
              isAnimationActive={false}
              {...(onSelect && {
                cursor: 'pointer',
                onClick: (entry: { payload?: HorizontalBarDatum }) => {
                  if (entry.payload) onSelect(entry.payload.key)
                },
              })}
            >
              <LabelList
                dataKey="share"
                position="right"
                formatter={(value: unknown) =>
                  typeof value === 'number' ? formatPercent(value) : ''
                }
                fill="var(--ink-2)"
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

function BarTooltip({ active, payload, totalJobs }: TooltipState & { totalJobs: number }) {
  const datum = activeRow<HorizontalBarDatum>({ active, payload })
  if (!datum) return null
  return (
    <TooltipBox title={datum.detail ? `${datum.label} · ${datum.detail}` : datum.label}>
      <TooltipRow
        value={formatPercent(datum.share)}
        label="das vagas"
        detail={`${formatNumber(datum.count)} de ${formatNumber(totalJobs)}`}
      />
    </TooltipBox>
  )
}
