import { z } from 'zod'
import { SkillSlugSchema } from '../api/schemas'

/*
 * A skills profile can travel in a link (?perfil=python,sql): to send to a friend or a mentor,
 * or to post "what an intern who knows SQL and Python is missing". Only skill slugs go in it.
 */

export const PROFILE_PARAM = 'perfil'
const MAX_SHARED = 40
const SharedSchema = z.array(SkillSlugSchema).min(1).max(MAX_SHARED)

/** The profile carried by the URL, or null (invalid values are dropped, never trusted). */
export function parseProfileParam(search: string): string[] | null {
  const value = new URLSearchParams(search).get(PROFILE_PARAM)
  if (!value) return null
  const slugs = [...new Set(value.split(',').map((part) => part.trim().toLowerCase()))]
  const parsed = SharedSchema.safeParse(
    slugs.filter((slug) => SkillSlugSchema.safeParse(slug).success),
  )
  return parsed.success ? parsed.data : null
}

/** This page's address (filters and tab included) carrying `known` as the profile. */
export function profileLink(href: string, known: readonly string[]): string {
  const url = new URL(href)
  url.searchParams.set(PROFILE_PARAM, known.join(','))
  url.hash = ''
  return url.toString()
}

export function withoutProfileParam(search: string): string {
  const params = new URLSearchParams(search)
  params.delete(PROFILE_PARAM)
  const query = params.toString()
  return query ? `?${query}` : ''
}
