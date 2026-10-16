import { useEffect, useState } from 'react'
import { writeStorage } from '../lib/storage'
import { loadVisits, recordVisit, VISITS_KEY } from '../lib/visits'

/**
 * When the visitor's previous visit ended (ISO), or null on a first visit. Jobs collected after
 * it are shown as "Nova". Kept only in this browser.
 */
export function useLastVisit(): string | null {
  const [visits] = useState(() => recordVisit(loadVisits(), new Date()))

  useEffect(() => {
    writeStorage(VISITS_KEY, JSON.stringify(visits))
  }, [visits])

  return visits.previous
}
