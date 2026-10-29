import { useState } from 'react'
import type { Workplaces } from '../../api/schemas'
import { formatNumber, formatPercent } from '../../lib/format'
import { WORKPLACE_LABELS } from '../../lib/labels'
import { TooltipBox, TooltipRow } from './ChartTooltip'
import { WORKPLACE_SERIES } from './chartData'

type Row = Workplaces['items'][number]

/** A segment narrower than this keeps its value in the tooltip and the table only. */
const MIN_LABELED_SHARE = 0.12
/** A row with fewer jobs is drawn faint and unlabeled: one posting moves its shares a lot. */
const MIN_ROW_JOBS = 10

/**
 * 100% stacked bars, one per area (plus all areas together on top): each bar splits the jobs
 * that say where work happens into remote, hybrid and on-site. Plain HTML: widths are shares.
 */
export function WorkplaceChart({ data, grow = false }: { data: Workplaces; grow?: boolean }) {
  const [active, setActive] = useState<string | null>(null)
  const anySmall = data.items.some((row) => row.total < MIN_ROW_JOBS)

  return (
    <figure
      aria-label="Modalidade de trabalho das vagas em cada área"
      // Growing spreads the rows over the extra height instead of leaving it empty below.
      className={`flex flex-col ${grow ? 'flex-1 justify-around' : ''}`}
    >
      {data.items.map((row, index) => {
        const key = row.area ?? 'todas'
        return (
          <div
            key={key}
            // Hover (a tap on touch screens) shows the counts; the table view has every value.
            onMouseEnter={() => setActive(key)}
            onMouseLeave={() => setActive(null)}
            className={`relative grid grid-cols-1 gap-x-3 gap-y-1 rounded-md px-1 py-2 sm:grid-cols-[11rem_1fr_5rem] sm:items-center ${
              active === key ? 'bg-surface-2' : ''
            } ${index === 0 && data.items.length > 1 ? 'border-line mb-1 border-b pb-3' : ''}`}
          >
            <span className={`text-sm ${index === 0 ? 'text-ink font-semibold' : 'text-ink-2'}`}>
              {row.label}
            </span>
            <StackedBar row={row} />
            <span className="text-muted text-xs tabular-nums sm:text-right">
              {formatNumber(row.total)} {row.total === 1 ? 'vaga' : 'vagas'}
            </span>
            {active === key && <RowTooltip row={row} />}
          </div>
        )
      })}
      {anySmall && (
        <figcaption className="text-muted mt-1 px-1 text-xs">
          Barras claras: menos de {MIN_ROW_JOBS} vagas, poucas para tirar conclusões.
        </figcaption>
      )}
    </figure>
  )
}

function StackedBar({ row }: { row: Row }) {
  const shares = new Map(row.workplaces.map((item) => [item.key, item.share]))
  const small = row.total < MIN_ROW_JOBS
  return (
    // 2px surface gaps between segments; the outer ends carry the 4px data-end radius.
    <div
      aria-hidden
      className={`flex h-6 gap-0.5 overflow-hidden rounded ${small ? 'opacity-40' : ''}`}
    >
      {WORKPLACE_SERIES.map((series) => {
        const share = shares.get(series.key) ?? 0
        if (share === 0) return null
        return (
          <div
            key={series.key}
            className="flex items-center justify-center text-xs font-semibold tabular-nums"
            style={{ width: `${share * 100}%`, background: series.color, color: series.text }}
          >
            {!small && share >= MIN_LABELED_SHARE && formatPercent(share)}
          </div>
        )
      })}
    </div>
  )
}

function RowTooltip({ row }: { row: Row }) {
  const known = row.total - row.unknown
  return (
    <div className="pointer-events-none absolute top-full left-1 z-10 mt-1 sm:left-[11.75rem]">
      <TooltipBox title={row.label}>
        {WORKPLACE_SERIES.map((series) => {
          const item = row.workplaces.find((workplace) => workplace.key === series.key)
          return (
            <TooltipRow
              key={series.key}
              color={series.color}
              value={formatPercent(item?.share ?? 0)}
              label={WORKPLACE_LABELS[series.key]}
              detail={`${formatNumber(item?.count ?? 0)} de ${formatNumber(known)}`}
            />
          )
        })}
        {row.unknown > 0 && (
          <p className="text-muted text-xs">{formatNumber(row.unknown)} sem modalidade informada</p>
        )}
      </TooltipBox>
    </div>
  )
}
