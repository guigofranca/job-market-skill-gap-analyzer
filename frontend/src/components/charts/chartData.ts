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

/**
 * Series slots that follow the entity, not its rank: a skill keeps its color while it stays on
 * the chart (filters reorder or replace the others), and a newcomer takes the lowest free slot.
 */
export function assignSlots(
  keys: readonly string[],
  previous: ReadonlyMap<string, number>,
): Map<string, number> {
  const slots = new Map<string, number>()
  for (const key of keys) {
    const slot = previous.get(key)
    if (slot !== undefined) slots.set(key, slot)
  }
  const used = new Set(slots.values())
  for (const key of keys) {
    if (slots.has(key)) continue
    let slot = 0
    while (used.has(slot)) slot += 1
    slots.set(key, slot)
    used.add(slot)
  }
  return slots
}

/**
 * Vertical positions for end-of-line labels: each label stays as close as it can to its line's
 * last point, at least `gap` px from its neighbours and inside [0, height].
 */
export function spreadLabels(targets: readonly number[], gap: number, height: number): number[] {
  const order = targets.map((y, index) => ({ y, index })).sort((a, b) => a.y - b.y)
  const placed = order.map((item) => item.y)
  for (let i = 0; i < placed.length; i += 1) {
    placed[i] = Math.max(placed[i] ?? 0, i > 0 ? (placed[i - 1] ?? 0) + gap : 0)
  }
  // Pushed past the bottom: walk back up.
  for (let i = placed.length - 1; i >= 0; i -= 1) {
    const limit = i === placed.length - 1 ? height : (placed[i + 1] ?? height) - gap
    placed[i] = Math.min(placed[i] ?? 0, limit)
  }
  const result = new Array<number>(targets.length)
  order.forEach((item, rank) => {
    result[item.index] = placed[rank] ?? item.y
  })
  return result
}
