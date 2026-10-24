import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { api, type Filters, type JobPage } from '../api/endpoints'

/*
 * One hook per widget. Query keys include the filters, so every widget refetches on its own when
 * they change; `keepPreviousData` holds the last render (dimmed) instead of flashing a skeleton.
 */

export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: ({ signal }) => api.meta(signal),
    staleTime: 10 * 60_000,
  })
}

export function useSummary(filters: Filters) {
  return useQuery({
    queryKey: ['summary', filters],
    queryFn: ({ signal }) => api.summary(filters, signal),
    placeholderData: keepPreviousData,
  })
}

export function useTopSkills(filters: Filters, limit = 15, enabled = true) {
  return useQuery({
    queryKey: ['top-skills', filters, limit],
    queryFn: ({ signal }) => api.topSkills(filters, limit, signal),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useLevelComparison(filters: Omit<Filters, 'level'>, limit = 10) {
  return useQuery({
    queryKey: ['compare-levels', filters, limit],
    queryFn: ({ signal }) => api.compareLevels(filters, limit, signal),
    placeholderData: keepPreviousData,
  })
}

export function useLocations(filters: Omit<Filters, 'city'>, limit = 30) {
  return useQuery({
    queryKey: ['locations', filters, limit],
    queryFn: ({ signal }) => api.locations(filters, limit, signal),
    placeholderData: keepPreviousData,
  })
}

export function useWorkplaces(filters: Omit<Filters, 'area' | 'workplace'>) {
  return useQuery({
    queryKey: ['workplaces', filters],
    queryFn: ({ signal }) => api.workplaces(filters, signal),
    placeholderData: keepPreviousData,
  })
}

export function useGap(filters: Filters, known: readonly string[]) {
  return useQuery({
    queryKey: ['gap', filters, known],
    queryFn: ({ signal }) => api.gap(filters, known, signal),
    placeholderData: keepPreviousData,
    enabled: known.length > 0,
  })
}

export function useMatches(
  filters: Filters,
  known: readonly string[],
  page: JobPage & { missing?: number },
) {
  return useQuery({
    queryKey: ['matches', filters, known, page],
    queryFn: ({ signal }) => api.matches(filters, known, page, signal),
    placeholderData: keepPreviousData,
    enabled: known.length > 0,
  })
}

export function useJobs(filters: Filters, page: JobPage, enabled = true) {
  return useQuery({
    queryKey: ['jobs', filters, page],
    queryFn: ({ signal }) => api.jobs(filters, page, signal),
    placeholderData: keepPreviousData,
    enabled,
  })
}

/** Extraction rules for reading a CV in the browser; fetched only when needed, never stale. */
export function useSkillPatterns(enabled: boolean) {
  return useQuery({
    queryKey: ['skill-patterns'],
    queryFn: ({ signal }) => api.skillPatterns(signal),
    staleTime: Infinity,
    enabled,
  })
}

const IDS_PER_REQUEST = 50

/**
 * The saved jobs that are still published, with fresh data (deadline). Jobs missing from the
 * answer have closed or were removed by the company.
 */
export function useJobsByIds(ids: readonly string[]) {
  const chunks: string[][] = []
  for (let start = 0; start < ids.length; start += IDS_PER_REQUEST) {
    chunks.push([...ids.slice(start, start + IDS_PER_REQUEST)].sort())
  }
  return useQueries({
    queries: chunks.map((chunk) => ({
      queryKey: ['jobs-by-id', chunk],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.jobs({}, { limit: IDS_PER_REQUEST, offset: 0, ids: chunk }, signal),
      staleTime: 5 * 60_000,
    })),
    combine: (results) => ({
      jobs: results.flatMap((result) => result.data?.items ?? []),
      isPending: results.some((result) => result.isPending),
      isError: results.some((result) => result.isError),
    }),
  })
}
