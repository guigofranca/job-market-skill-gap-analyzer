import { z } from 'zod'
import { readStorage } from './storage'

export const VISITS_KEY = 'skill-gap:visits'
/** A pause longer than this starts a new visit; reloads within a visit keep the same baseline. */
const SESSION_GAP_MS = 30 * 60_000

const VisitsSchema = z.object({
  /** Last page load. */
  last: z.iso.datetime({ offset: true }),
  /** End of the previous visit: jobs collected after it are "new" for this visit. */
  previous: z.iso.datetime({ offset: true }).nullable(),
})
export type Visits = z.infer<typeof VisitsSchema>

/** Stored data is untrusted: anything that does not parse counts as a first visit. */
export function loadVisits(): Visits | null {
  try {
    const parsed = VisitsSchema.safeParse(JSON.parse(readStorage(VISITS_KEY) ?? 'null'))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** The visit record after a page load at `now`. Idempotent within a visit. */
export function recordVisit(stored: Visits | null, now: Date): Visits {
  const last = now.toISOString()
  if (!stored) return { last, previous: null }
  const gap = now.getTime() - Date.parse(stored.last)
  return { last, previous: gap > SESSION_GAP_MS ? stored.last : stored.previous }
}

/** Same rule as the API: found at most this many days after publication = a fresh find. */
export const FRESH_FIND_DAYS = 3

/**
 * "Nova para você": a fresh find (published at most FRESH_FIND_DAYS before it was found)
 * collected after the previous visit. A posting found weeks after it was published - a new
 * source or search term back-filled it - is not news. Undated postings rely on the find alone.
 */
export function isNewSince(
  job: { first_seen: string | null; published_at: string | null },
  since: string | null,
): boolean {
  if (!job.first_seen || !since) return false
  const found = Date.parse(job.first_seen)
  if (found <= Date.parse(since)) return false
  if (!job.published_at) return true
  const foundDay = Date.parse(`${new Date(found).toISOString().slice(0, 10)}T00:00:00Z`)
  const earliest = new Date(foundDay - FRESH_FIND_DAYS * 86_400_000).toISOString().slice(0, 10)
  return job.published_at >= earliest
}
