import { useCallback, useEffect, useState } from 'react'
import type { z } from 'zod'
import type { Filters } from '../api/endpoints'
import {
  AreaSchema,
  CityKeySchema,
  InclusionSchema,
  LevelSchema,
  SkillSlugSchema,
  StateCodeSchema,
  WorkplaceSchema,
} from '../api/schemas'

const FILTER_KEYS = [
  'level',
  'area',
  'skill',
  'state',
  'city',
  'workplace',
  'inclusion',
] as const satisfies readonly (keyof Filters)[]
/** Filters that no longer exist: dropped from old shared links instead of lingering in the URL. */
const RETIRED_KEYS = ['source', 'contract', 'days'] as const

/** Reads filters from the query string, silently dropping anything that is not a valid value. */
export function parseFilters(search: string): Filters {
  const params = new URLSearchParams(search)
  const pick = <T>(schema: z.ZodType<T>, key: string): T | undefined => {
    const result = schema.safeParse(params.get(key))
    return result.success ? result.data : undefined
  }
  return {
    level: pick(LevelSchema, 'level'),
    area: pick(AreaSchema, 'area'),
    skill: pick(SkillSlugSchema, 'skill'),
    state: pick(StateCodeSchema, 'state'),
    city: pick(CityKeySchema, 'city'),
    workplace: pick(WorkplaceSchema, 'workplace'),
    inclusion: pick(InclusionSchema, 'inclusion'),
  }
}

export function filtersToSearch(filters: Filters, current: string): string {
  const params = new URLSearchParams(current)
  for (const key of RETIRED_KEYS) params.delete(key)
  for (const key of FILTER_KEYS) {
    const value = filters[key]
    if (value) params.set(key, String(value))
    else params.delete(key)
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** Filter state mirrored in the URL, so any view of the dashboard can be shared as a link. */
export function useFilters() {
  const [filters, setFilters] = useState<Filters>(() => parseFilters(window.location.search))

  useEffect(() => {
    const search = filtersToSearch(filters, window.location.search)
    if (search !== window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${search}`)
    }
  }, [filters])

  useEffect(() => {
    const onPopState = () => setFilters(parseFilters(window.location.search))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const updateFilters = useCallback((patch: Partial<Filters>) => {
    setFilters((previous) => ({ ...previous, ...patch }))
  }, [])

  const resetFilters = useCallback(() => setFilters({}), [])

  return { filters, updateFilters, resetFilters }
}
