import { useState } from 'react'
import { assignSlots } from '../components/charts/chartData'
import { seriesColor } from '../lib/series'

/** Series colors that stay with each skill while it stays on the chart (filters never repaint it). */
export function useSkillColors(slugs: readonly string[]): Map<string, string> {
  const key = slugs.join(',')
  const [state, setState] = useState(() => ({ key, slots: assignSlots(slugs, new Map()) }))
  // The skills changed: reassign during render, keeping the survivors' slots (React's pattern
  // for state derived from props, without an extra effect pass).
  if (state.key !== key) setState({ key, slots: assignSlots(slugs, state.slots) })
  const slots = state.key === key ? state.slots : assignSlots(slugs, state.slots)
  return new Map([...slots].map(([slug, slot]) => [slug, seriesColor(slot)]))
}
