import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { readStorage, writeStorage } from '../lib/storage'
import { parseViewed, VIEWED_KEY, withViewed, type Viewed } from '../lib/viewed'

function load(): Viewed {
  try {
    return parseViewed(JSON.parse(readStorage(VIEWED_KEY) ?? '{}'))
  } catch {
    return {}
  }
}

/**
 * Job postings the visitor opened, and when ("vista há 3 horas"). Kept only in this browser, and
 * kept in sync across open tabs.
 */
export function useViewedState() {
  const [viewed, setViewed] = useState<Viewed>(load)

  useEffect(() => {
    writeStorage(VIEWED_KEY, JSON.stringify(viewed))
  }, [viewed])

  // Another tab opened a posting: follow it (the storage event only fires in the other tabs).
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === VIEWED_KEY) setViewed(load())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const markViewed = useCallback((id: string) => {
    setViewed((current) => withViewed(current, id, new Date()))
  }, [])
  const ids = useMemo(() => Object.keys(viewed), [viewed])

  return { viewed, ids, markViewed }
}

export type ViewedJobs = ReturnType<typeof useViewedState>

/** Provided once by the dashboard; null where no provider exists (e.g. isolated tests). */
export const ViewedContext = createContext<ViewedJobs | null>(null)

export function useViewed(): ViewedJobs | null {
  return useContext(ViewedContext)
}
