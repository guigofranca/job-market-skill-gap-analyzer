import { AreaSchema, type Area } from '../api/schemas'
import { AREA_LABELS } from './labels'

export interface AreaCount {
  key: Area
  label: string
  count: number
}

/** The options (from /meta or /summary) that are known areas with jobs, most jobs first. */
export function areasWithJobs(options: readonly { key: string; count: number }[]): AreaCount[] {
  return options
    .flatMap((option) => {
      const key = AreaSchema.safeParse(option.key).data
      return key && option.count > 0 ? [{ key, label: AREA_LABELS[key], count: option.count }] : []
    })
    .sort((a, b) => b.count - a.count)
}
