import { useCallback, useEffect, useState } from 'react'
import { parseProfileParam, withoutProfileParam } from '../lib/profileLink'
import type { KnownSkills } from './useKnownSkills'

function sameSkills(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((slug) => b.includes(slug))
}

/**
 * A profile that came in the link (?perfil=...): offered once, never applied without a click
 * (the visitor's own profile is not overwritten behind their back).
 */
export function useSharedProfile(profile: KnownSkills) {
  const { known, replace } = profile
  const [shared, setShared] = useState<string[] | null>(() => {
    const slugs = parseProfileParam(window.location.search)
    return slugs && !sameSkills(slugs, known) ? slugs : null
  })

  // Read once: the address goes back to the plain filters (a reload does not offer it again).
  useEffect(() => {
    const search = withoutProfileParam(window.location.search)
    if (search !== window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${search}`)
    }
  }, [])

  const accept = useCallback(() => {
    if (shared) replace(shared)
    setShared(null)
  }, [shared, replace])
  const dismiss = useCallback(() => setShared(null), [])

  return { shared, accept, dismiss }
}
