import type { SkillPatterns } from '../api/schemas'

/** Longest CV text read (a few pages); longer pastes are cut. */
export const MAX_CV_CHARS = 30_000

export interface CompiledPattern {
  slug: string
  regex: RegExp
}

/** Same text form as the backend's `matching_form`: NFKD without combining marks ("Estágio" -> "Estagio"). */
export function matchingForm(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '')
}

/** Patterns this browser cannot compile are skipped: one bad rule must not break the feature. */
export function compilePatterns(patterns: SkillPatterns): CompiledPattern[] {
  const compiled: CompiledPattern[] = []
  for (const item of patterns.items) {
    try {
      compiled.push({
        slug: item.slug,
        regex: new RegExp(item.pattern, item.ignore_case ? 'i' : ''),
      })
    } catch {
      // Unsupported syntax in this engine.
    }
  }
  return compiled
}

/** Skills mentioned in the text, in taxonomy order, without duplicates. Runs locally. */
export function extractSkills(text: string, patterns: readonly CompiledPattern[]): string[] {
  const normalized = matchingForm(text.slice(0, MAX_CV_CHARS))
  const found = new Set<string>()
  for (const { slug, regex } of patterns) {
    if (!found.has(slug) && regex.test(normalized)) found.add(slug)
  }
  return [...found]
}
