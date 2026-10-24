import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Trends } from '../../api/schemas'
import { formatDate, formatDayMonth, formatNumber, formatPercent } from '../../lib/format'
import { TooltipBox, TooltipRow } from './ChartTooltip'
import { AXIS_TICK, shareAxis, spreadLabels, type TooltipState } from './chartData'

const HEIGHT = 260
const MARGIN_TOP = 8
const X_AXIS_HEIGHT = 24
/** Room on the right for the end-of-line labels. */
const LABEL_WIDTH = 132
const LABEL_GAP = 16

type Row = Record<string, number | string>

/**
 * Share of the filtered jobs asking for each skill, per collection day. Few lines (4), each
 * labeled at its end, so identity never rests on color alone.
 */
export function SkillTrendChart({
  data,
  colors,
}: {
  data: Trends
  colors: ReadonlyMap<string, string>
}) {
  const rows: Row[] = data.days.map((day, index) => {
    const row: Row = { day: day.day, jobs: day.jobs }
    for (const skill of data.skills) {
      const point = skill.points[index]
      row[skill.slug] = point?.share ?? 0
      row[`${skill.slug}:count`] = point?.count ?? 0
    }
    return row
  })
  const { domainMax, ticks } = shareAxis(
    Math.max(...data.skills.flatMap((skill) => skill.points.map((point) => point.share)), 0.05),
  )
  const plotHeight = HEIGHT - MARGIN_TOP - X_AXIS_HEIGHT
  const ends = data.skills.map(
    (skill) => MARGIN_TOP + (1 - (skill.points.at(-1)?.share ?? 0) / domainMax) * plotHeight,
  )
  const labelTops = spreadLabels(ends, LABEL_GAP, HEIGHT - X_AXIS_HEIGHT)

  return (
    <figure
      aria-label="Participação das competências mais pedidas, por dia de coleta"
      className="relative"
      style={{ height: HEIGHT }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: MARGIN_TOP, right: LABEL_WIDTH, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="day"
            tickFormatter={formatDayMonth}
            tick={AXIS_TICK}
            height={X_AXIS_HEIGHT}
            axisLine={{ stroke: 'var(--axis)' }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={[0, domainMax]}
            ticks={ticks}
            tickFormatter={formatPercent}
            tick={AXIS_TICK}
            width={44}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
            content={({ active, payload }) => (
              <SkillTooltip active={active} payload={payload} data={data} colors={colors} />
            )}
          />
          {data.skills.map((skill) => (
            <Line
              key={skill.slug}
              dataKey={skill.slug}
              name={skill.name}
              type="linear"
              stroke={colors.get(skill.slug) ?? 'var(--axis-text)'}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {/* Direct labels, nudged apart so lines ending close together stay readable. */}
      <ul
        aria-hidden
        className="pointer-events-none absolute top-0 right-0"
        style={{ width: LABEL_WIDTH - 8, height: HEIGHT }}
      >
        {data.skills.map((skill, index) => (
          <li
            key={skill.slug}
            className="text-ink-2 absolute left-0 flex w-full items-center gap-1.5 truncate text-xs leading-4"
            style={{ top: (labelTops[index] ?? 0) - LABEL_GAP / 2 }}
          >
            <span
              className="h-0.5 w-2.5 shrink-0 rounded"
              style={{ background: colors.get(skill.slug) ?? 'var(--axis-text)' }}
            />
            <span className="truncate">{skill.name}</span>
            <span className="text-muted tabular-nums">
              {formatPercent(skill.points.at(-1)?.share ?? 0)}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

function SkillTooltip({
  active,
  payload,
  data,
  colors,
}: TooltipState & { data: Trends; colors: ReadonlyMap<string, string> }) {
  const row = active ? (payload?.[0]?.payload as Row | undefined) : undefined
  if (!row) return null
  const skills = [...data.skills].sort(
    (a, b) => Number(row[b.slug] ?? 0) - Number(row[a.slug] ?? 0),
  )
  return (
    <TooltipBox title={`${formatDate(String(row.day))} · ${formatNumber(Number(row.jobs))} vagas`}>
      {skills.map((skill) => (
        <TooltipRow
          key={skill.slug}
          color={colors.get(skill.slug) ?? 'var(--axis-text)'}
          value={formatPercent(Number(row[skill.slug] ?? 0))}
          label={skill.name}
          detail={`${formatNumber(Number(row[`${skill.slug}:count`] ?? 0))} vagas`}
        />
      ))}
    </TooltipBox>
  )
}

/** Open jobs per collection day. One series: the title names it, no legend. */
export function JobsPerDayChart({ data }: { data: Trends }) {
  return (
    <figure aria-label="Vagas abertas por dia de coleta" style={{ height: 120 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={[...data.days]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="day"
            tickFormatter={formatDayMonth}
            tick={AXIS_TICK}
            height={X_AXIS_HEIGHT}
            axisLine={{ stroke: 'var(--axis)' }}
            tickLine={false}
            minTickGap={24}
          />
          {/* From zero: a day-to-day wobble of a few jobs must not look like a swing. */}
          <YAxis
            domain={[0, (max: number) => Math.max(100, Math.ceil(max / 100) * 100)]}
            tickCount={3}
            allowDecimals={false}
            tickFormatter={formatNumber}
            tick={AXIS_TICK}
            width={44}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
            content={({ active, payload }) => {
              const day = active
                ? (payload?.[0]?.payload as Trends['days'][number] | undefined)
                : undefined
              return day ? (
                <TooltipBox title={formatDate(day.day)}>
                  <TooltipRow value={formatNumber(day.jobs)} label="vagas abertas" />
                </TooltipBox>
              ) : null
            }}
          />
          <Line
            dataKey="jobs"
            type="linear"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  )
}
