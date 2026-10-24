import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { SkillSlugSchema } from '../api/schemas'
import { readStorage, writeStorage } from '../lib/storage'

const STORAGE_KEY = 'skill-gap:known-skills'
const MAX_KNOWN = 40
const StoredSchema = z.array(SkillSlugSchema).max(MAX_KNOWN)

/** Stored data is untrusted too: anything that does not parse is discarded. */
function load(): string[] {
  try {
    const parsed = StoredSchema.safeParse(JSON.parse(readStorage(STORAGE_KEY) ?? '[]'))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

export type KnownSkills = ReturnType<typeof useKnownSkills>

/** The skills the visitor says they already have (kept only in this browser). */
export function useKnownSkills() {
  const [known, setKnown] = useState<string[]>(load)

  useEffect(() => {
    writeStorage(STORAGE_KEY, JSON.stringify(known))
  }, [known])

  const add = useCallback((slug: string) => {
    setKnown((current) =>
      current.includes(slug) || current.length >= MAX_KNOWN ? current : [...current, slug],
    )
  }, [])
  const remove = useCallback((slug: string) => {
    setKnown((current) => current.filter((item) => item !== slug))
  }, [])
  const clear = useCallback(() => setKnown([]), [])
  const replace = useCallback((slugs: readonly string[]) => {
    setKnown([...new Set(slugs)].slice(0, MAX_KNOWN))
  }, [])

  return { known, add, remove, clear, replace, max: MAX_KNOWN }
}
