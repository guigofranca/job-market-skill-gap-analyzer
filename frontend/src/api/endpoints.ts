import { apiGet } from './client'
import {
  GapSchema,
  JobsSchema,
  LevelComparisonSchema,
  LocationsSchema,
  MatchesSchema,
  MetaSchema,
  SkillPatternsSchema,
  SummarySchema,
  TopSkillsSchema,
  WorkplacesSchema,
  type Area,
  type Inclusion,
  type Level,
  type Workplace,
} from './schemas'

export interface Filters {
  level?: Level | undefined
  area?: Area | undefined
  skill?: string | undefined
  /** Brazilian state code ("SP"). */
  state?: string | undefined
  /** City key ("sp-campinas"), see the API's /meta cities. */
  city?: string | undefined
  workplace?: Workplace | undefined
  inclusion?: Inclusion | undefined
}

/** Pagination and list-only filters of the job endpoints. */
export interface JobPage {
  limit: number
  offset: number
  /** Title search. */
  q?: string | undefined
  /** Only jobs first collected after this ISO datetime. */
  since?: string | undefined
  /** Only these job ids (up to 200), e.g. the saved or the opened ones. */
  ids?: readonly string[] | undefined
  /** Never these job ids (up to 200), e.g. the opened ones. */
  exclude?: readonly string[] | undefined
}

const API = '/api/v1'

export const api = {
  meta: (signal?: AbortSignal) => apiGet(`${API}/meta`, MetaSchema, {}, signal),

  summary: (filters: Filters, signal?: AbortSignal) =>
    apiGet(`${API}/summary`, SummarySchema, { ...filters }, signal),

  topSkills: (filters: Filters, limit: number, signal?: AbortSignal) =>
    apiGet(`${API}/skills/top`, TopSkillsSchema, { ...filters, limit }, signal),

  compareLevels: (filters: Omit<Filters, 'level'>, limit: number, signal?: AbortSignal) =>
    apiGet(`${API}/skills/compare-levels`, LevelComparisonSchema, { ...filters, limit }, signal),

  /** States, or the cities of the selected state. Ignores the city filter. */
  locations: (filters: Omit<Filters, 'city'>, limit: number, signal?: AbortSignal) =>
    apiGet(`${API}/locations`, LocationsSchema, { ...filters, limit }, signal),

  /** Ignores the area and workplace filters: the chart compares them. */
  workplaces: (filters: Omit<Filters, 'area' | 'workplace'>, signal?: AbortSignal) =>
    apiGet(`${API}/workplaces`, WorkplacesSchema, { ...filters }, signal),

  skillPatterns: (signal?: AbortSignal) =>
    apiGet(`${API}/skills/patterns`, SkillPatternsSchema, {}, signal),

  gap: (filters: Filters, known: readonly string[], signal?: AbortSignal) =>
    apiGet(`${API}/skills/gap`, GapSchema, { ...filters, known, limit: 8 }, signal),

  jobs: (filters: Filters, page: JobPage, signal?: AbortSignal) =>
    apiGet(`${API}/jobs`, JobsSchema, { ...filters, ...page }, signal),

  matches: (
    filters: Filters,
    known: readonly string[],
    page: JobPage & { missing?: number | undefined },
    signal?: AbortSignal,
  ) => apiGet(`${API}/jobs/matches`, MatchesSchema, { ...filters, known, ...page }, signal),
}
