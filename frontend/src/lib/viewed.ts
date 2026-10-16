import { z } from 'zod'
import { formatRelativeTime } from './format'

export const VIEWED_KEY = 'skill-gap:viewed'
/** The most recent ones only: it also bounds the API query that hides or lists them (ids). */
export const MAX_VIEWED = 200
const KEEP_DAYS = 30

/**
 * The "Vistas" filter: hide the postings already opened, or list only them. The ids are read when
 * the filter is chosen, so opening one more does not make it vanish from under the visitor.
 */
export interface SeenFilter {
  mode: 'hide' | 'only'
  ids: readonly string[]
}

/** Job id -> when the visitor last opened its posting (ISO). */
export type Viewed = Readonly<Record<string, string>>

const EntrySchema = z.tuple([z.string().regex(/^[a-f0-9]{16}$/), z.iso.datetime()])
type Entry = [string, string]

function prune(entries: readonly Entry[], now: Date): Viewed {
  const oldest = now.getTime() - KEEP_DAYS * 86_400_000
  return Object.fromEntries(
    entries
      .filter(([, at]) => Date.parse(at) >= oldest)
      .sort((a, b) => b[1].localeCompare(a[1]))
      .slice(0, MAX_VIEWED),
  )
}

/** Stored data is untrusted: invalid entries are dropped one by one, old ones expire. */
export function parseViewed(raw: unknown, now: Date = new Date()): Viewed {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const valid = Object.entries(raw).filter(
    (entry): entry is Entry => EntrySchema.safeParse(entry).success,
  )
  return prune(valid, now)
}

export function withViewed(viewed: Viewed, id: string, now: Date): Viewed {
  const others = Object.entries(viewed).filter(([key]) => key !== id)
  return prune([[id, now.toISOString()], ...others], now)
}

/** "vista agora", "vista há 3 horas", "vista ontem". */
export function formatViewed(iso: string, now: Date = new Date()): string {
  const minutes = (now.getTime() - Date.parse(iso)) / 60_000
  return minutes < 5 ? 'vista agora' : `vista ${formatRelativeTime(iso, now)}`
}
