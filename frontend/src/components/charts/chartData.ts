import type { LevelComparison, SkillStat, Workplace } from '../../api/schemas'
import { CATEGORY_LABELS } from '../../lib/labels'
import { seriesColor } from '../../lib/series'

/*
 * Data shaping and shared constants for the chart components (kept apart from the components
 * themselves so React Fast Refresh can hot-swap them).
 */

export const AXIS_TICK = { fill: 'var(--axis-text)', fontSize: 12 }
export const CATEGORY_TICK = { fill: 'var(--ink-2)', fontSize: 12 }

/** The part of Recharts' tooltip props our tooltips need (rows are our own validated data). */
export interface TooltipState {
  active?: boolean | undefined
  payload?: ReadonlyArray<{ payload?: unknown }> | undefined
}

export function activeRow<T>({ active, payload }: TooltipState): T | undefined {
  return active ? (payload?.[0]?.payload as T | undefined) : undefined
}

export interface HorizontalBarDatum {
  key: string
  label: string
  share: number
  count: number
  detail?: string
}

export function skillsToBars(items: readonly SkillStat[]): HorizontalBarDatum[] {
  return items.map((item) => ({
    key: item.slug,
    label: item.name,
    share: item.share,
    count: item.count,
    detail: CATEGORY_LABELS[item.category],
  }))
}

export const LEVEL_SERIES = [
  { key: 'estagio', label: 'Estágio', color: seriesColor(0) },
  { key: 'junior', label: 'Júnior', color: seriesColor(1) },
] as const

export type LevelComparisonItem = LevelComparison['items'][number]

/** Ordered from most remote to on-site: an ordinal blue ramp, so the order shows in the color. */
export const WORKPLACE_SERIES = [
  { key: 'remoto', color: 'var(--workplace-1)', text: 'var(--on-workplace-1)' },
  { key: 'hibrido', color: 'var(--workplace-2)', text: 'var(--on-workplace-2)' },
  { key: 'presencial', color: 'var(--workplace-3)', text: 'var(--on-workplace-3)' },
] as const satisfies readonly { key: Workplace; color: string; text: string }[]

const AXIS_STEPS = [0.05, 0.1, 0.2, 0.25] as const
const MAX_AXIS_INTERVALS = 5

/**
 * A percentage axis that ends on the first tick at or past the longest bar (no empty band on the
 * right, no squeezed "45% 50%" pair), with at most six ticks so it stays legible on narrow
 * charts. Value labels sit in the chart's right margin, so no headroom is added.
 */
export function shareAxis(maxShare: number): { domainMax: number; ticks: number[] } {
  const target = Math.min(1, maxShare)
  const step =
    AXIS_STEPS.find((candidate) => Math.ceil(target / candidate - 1e-9) <= MAX_AXIS_INTERVALS) ??
    0.25
  const intervals = Math.ceil(target / step - 1e-9)
  const domainMax = Math.min(1, Number((intervals * step).toFixed(4)))
  const ticks = Array.from({ length: Math.round(domainMax / step) + 1 }, (_, index) =>
    Number((index * step).toFixed(4)),
  )
  return { domainMax, ticks }
}
