import type { Filters } from '../api/endpoints'
import type { Meta } from '../api/schemas'

/**
 * Filters that cannot apply to this dataset: a technology, state or city with no jobs (old or
 * hand-edited links), or a city outside the selected state. Returned as a patch that clears them,
 * so they are dropped before any request is made (the API would reject an unknown skill).
 */
export function staleFilters(filters: Filters, meta: Meta): Partial<Filters> {
  const patch: Partial<Filters> = {}
  if (filters.skill && !meta.skills.some((skill) => skill.slug === filters.skill)) {
    patch.skill = undefined
  }
  if (filters.state && !meta.states.some((state) => state.key === filters.state)) {
    patch.state = undefined
  }
  if (filters.city) {
    const city = meta.cities.find((item) => item.key === filters.city)
    if (!city || (filters.state && city.state !== filters.state)) patch.city = undefined
  }
  return patch
}
