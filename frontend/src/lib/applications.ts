import { z } from 'zod'
import { AreaSchema, LevelSchema, SavedSourceSchema, type Job } from '../api/schemas'
import { daysUntil } from './format'

export const MAX_APPLICATIONS = 200
export const MAX_NOTE_CHARS = 300
/** "Closing soon" for a saved job not applied to yet. */
export const CLOSING_SOON_DAYS = 7

/** Where the visitor is with each saved job, in pipeline order. */
export const STATUSES = ['salva', 'candidatei', 'processo', 'oferta', 'encerrada'] as const
export type Status = (typeof STATUSES)[number]

export const STATUS_LABELS: Record<Status, string> = {
  salva: 'Salva (não me candidatei)',
  candidatei: 'Candidatei-me',
  processo: 'Em processo seletivo',
  oferta: 'Recebi proposta',
  encerrada: 'Encerrada / não seguiu',
}

export const STATUS_SHORT: Record<Status, string> = {
  salva: 'Salvas',
  candidatei: 'Candidatei-me',
  processo: 'Em processo',
  oferta: 'Propostas',
  encerrada: 'Encerradas',
}

/**
 * What is kept of a job: enough to show and open it even after it leaves the dataset (closed
 * postings disappear from the API, but the visitor's history should not).
 */
const SavedJobSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{16}$/),
  title: z.string().min(1).max(300),
  company: z.string().max(300).nullable(),
  location: z.string().max(300).nullable(),
  url: z.url({ protocol: /^https?$/ }),
  level: LevelSchema,
  area: AreaSchema,
  source: SavedSourceSchema,
  deadline: z.iso.date().nullable(),
})
export type SavedJob = z.infer<typeof SavedJobSchema>

export const ApplicationSchema = z.object({
  job: SavedJobSchema,
  status: z.enum(STATUSES),
  note: z.string().max(MAX_NOTE_CHARS),
  savedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Application = z.infer<typeof ApplicationSchema>

export function snapshot(job: Job): SavedJob {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    url: job.url,
    level: job.level,
    area: job.area,
    source: job.source,
    deadline: job.deadline,
  }
}

/** Stored data is untrusted: invalid entries are dropped one by one, never the whole list. */
export function parseApplications(raw: unknown): Application[] {
  if (!Array.isArray(raw)) return []
  const valid: Application[] = []
  const seen = new Set<string>()
  for (const item of raw.slice(0, MAX_APPLICATIONS)) {
    const parsed = ApplicationSchema.safeParse(item)
    if (parsed.success && !seen.has(parsed.data.job.id)) {
      seen.add(parsed.data.job.id)
      valid.push(parsed.data)
    }
  }
  return valid
}

/** Saved jobs not applied to yet whose deadline is within `days` (today included). */
export function closingSoon(
  applications: readonly Application[],
  today: Date = new Date(),
  days = CLOSING_SOON_DAYS,
): Application[] {
  return applications
    .filter((item) => {
      if (item.status !== 'salva' || !item.job.deadline) return false
      const left = daysUntil(item.job.deadline, today)
      return left !== null && left >= 0 && left <= days
    })
    .sort((a, b) => (a.job.deadline ?? '').localeCompare(b.job.deadline ?? ''))
}

/** By status (pipeline order), then the nearest deadline, then the most recently saved. */
export function sortApplications(applications: readonly Application[]): Application[] {
  return [...applications].sort(
    (a, b) =>
      STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status) ||
      (a.job.deadline ?? '9999').localeCompare(b.job.deadline ?? '9999') ||
      b.savedAt.localeCompare(a.savedAt),
  )
}
