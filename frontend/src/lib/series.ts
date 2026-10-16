/**
 * Categorical slots, in the validated order. Colors are assigned to an entity (a skill) by its
 * position in a stable list, never by its current rank, so filtering never repaints a series.
 * There are deliberately only six: more series than that should be a table, not more hues.
 */
export const SERIES_COLORS = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
] as const

export function seriesColor(slot: number): string {
  return SERIES_COLORS[slot] ?? 'var(--axis-text)'
}
