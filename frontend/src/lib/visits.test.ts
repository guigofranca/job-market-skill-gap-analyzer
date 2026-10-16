import { afterEach, describe, expect, it } from 'vitest'
import { isNewSince, loadVisits, recordVisit, VISITS_KEY } from './visits'

const at = (iso: string) => new Date(iso)

describe('recordVisit', () => {
  it('has no baseline on a first visit', () => {
    expect(recordVisit(null, at('2026-10-12T10:00:00Z'))).toEqual({
      last: '2026-10-12T10:00:00.000Z',
      previous: null,
    })
  })

  it('keeps the baseline when reloading within the same visit', () => {
    const stored = { last: '2026-10-12T10:00:00.000Z', previous: '2026-10-11T08:00:00.000Z' }
    expect(recordVisit(stored, at('2026-10-12T10:20:00Z')).previous).toBe(stored.previous)
  })

  it('starts a new visit after a pause, with the previous visit as baseline', () => {
    const stored = { last: '2026-10-12T10:00:00.000Z', previous: null }
    expect(recordVisit(stored, at('2026-10-12T18:00:00Z'))).toEqual({
      last: '2026-10-12T18:00:00.000Z',
      previous: '2026-10-12T10:00:00.000Z',
    })
  })
})

describe('loadVisits', () => {
  afterEach(() => localStorage.clear())

  it('discards tampered storage', () => {
    localStorage.setItem(VISITS_KEY, '{"last":"ontem","previous":null}')
    expect(loadVisits()).toBeNull()
    localStorage.setItem(VISITS_KEY, '{not json')
    expect(loadVisits()).toBeNull()
  })
})

describe('isNewSince', () => {
  const visit = '2026-10-11T23:00:00-03:00' // 2026-10-12T02:00Z

  it('needs the job to be found after the visit, whatever the offset', () => {
    const job = (first_seen: string | null) => ({ first_seen, published_at: '2026-10-12' })
    expect(isNewSince(job('2026-10-12T01:04:00+00:00'), visit)).toBe(false)
    expect(isNewSince(job('2026-10-12T03:00:00+00:00'), visit)).toBe(true)
    expect(isNewSince(job(null), visit)).toBe(false)
    expect(isNewSince(job('2026-10-12T03:00:00Z'), null)).toBe(false)
  })

  it('counts fresh finds only: published at most 3 days before being found', () => {
    const found = '2026-10-12T05:00:00Z'
    // Friday's posting found on Monday (no collection over the weekend): still news.
    expect(isNewSince({ first_seen: found, published_at: '2026-10-09' }, visit)).toBe(true)
    // Back-filled by a new search term weeks after publication: not news.
    expect(isNewSince({ first_seen: found, published_at: '2026-10-08' }, visit)).toBe(false)
    expect(isNewSince({ first_seen: found, published_at: '2026-09-01' }, visit)).toBe(false)
    expect(isNewSince({ first_seen: found, published_at: null }, visit)).toBe(true)
  })
})
