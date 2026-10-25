import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Job } from '../api/schemas'
import {
  MAX_APPLICATIONS,
  MAX_NOTE_CHARS,
  parseApplications,
  snapshot,
  type Application,
  type Status,
} from '../lib/applications'
import { mergeApplications } from '../lib/applicationsFile'
import { readStorage, writeStorage } from '../lib/storage'

const STORAGE_KEY = 'skill-gap:applications'

function load(): Application[] {
  try {
    return parseApplications(JSON.parse(readStorage(STORAGE_KEY) ?? '[]'))
  } catch {
    return []
  }
}

/**
 * Saved jobs and where the visitor is with each one. Kept only in this browser, and kept in sync
 * across open tabs.
 */
export function useApplicationsState() {
  const [applications, setApplications] = useState<Application[]>(load)

  useEffect(() => {
    writeStorage(STORAGE_KEY, JSON.stringify(applications))
  }, [applications])

  // Another tab changed the list: follow it (the storage event only fires in the other tabs).
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setApplications(load())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const edit = useCallback((id: string, patch: Partial<Pick<Application, 'status' | 'note'>>) => {
    setApplications((current) =>
      current.map((item) =>
        item.job.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
      ),
    )
  }, [])

  const save = useCallback((job: Job) => {
    setApplications((current) => {
      if (current.some((item) => item.job.id === job.id) || current.length >= MAX_APPLICATIONS) {
        return current
      }
      const now = new Date().toISOString()
      return [
        ...current,
        { job: snapshot(job), status: 'salva', note: '', savedAt: now, updatedAt: now },
      ]
    })
  }, [])
  const remove = useCallback((id: string) => {
    setApplications((current) => current.filter((item) => item.job.id !== id))
  }, [])
  const setStatus = useCallback((id: string, status: Status) => edit(id, { status }), [edit])
  const setNote = useCallback(
    (id: string, note: string) => edit(id, { note: note.slice(0, MAX_NOTE_CHARS) }),
    [edit],
  )
  /** Saved deadlines can change (or become known) while the job is still published. */
  const refresh = useCallback((jobs: readonly Job[]) => {
    const fresh = new Map(jobs.map((job) => [job.id, job.deadline]))
    setApplications((current) => {
      let changed = false
      const next = current.map((item) => {
        const deadline = fresh.get(item.job.id)
        if (deadline === undefined || deadline === item.job.deadline) return item
        changed = true
        return { ...item, job: { ...item.job, deadline } }
      })
      return changed ? next : current
    })
  }, [])

  /** Entries from a backup file join the list (see mergeApplications); returns what changed. */
  const importItems = useCallback(
    (items: readonly Application[]) => {
      const result = mergeApplications(applications, items)
      setApplications(result.applications)
      return { added: result.added, updated: result.updated }
    },
    [applications],
  )

  const ids = useMemo(() => new Set(applications.map((item) => item.job.id)), [applications])

  return {
    applications,
    ids,
    save,
    remove,
    setStatus,
    setNote,
    refresh,
    importItems,
    max: MAX_APPLICATIONS,
  }
}

export type Applications = ReturnType<typeof useApplicationsState>

/** Provided once by the dashboard; null where no provider exists (e.g. isolated tests). */
export const ApplicationsContext = createContext<Applications | null>(null)

export function useApplications(): Applications | null {
  return useContext(ApplicationsContext)
}
