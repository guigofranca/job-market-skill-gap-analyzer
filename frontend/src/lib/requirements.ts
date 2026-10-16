import type { Requirements } from '../api/schemas'
import { ENGLISH_REQUIRED_LABELS } from './labels'

/** "2028-06" -> "06/2028". */
export function formatYearMonth(value: string): string {
  const [year, month] = value.split('-')
  return `${month}/${year}`
}

function semesterRange(min: number | null, max: number | null): string | null {
  if (min && max) return min === max ? `${min}º semestre` : `Do ${min}º ao ${max}º semestre`
  if (min) return `A partir do ${min}º semestre`
  if (max) return `Até o ${max}º semestre`
  return null
}

function graduationRange(from: string | null, to: string | null): string | null {
  if (from && to) {
    return from === to
      ? `Formatura em ${formatYearMonth(from)}`
      : `Formatura entre ${formatYearMonth(from)} e ${formatYearMonth(to)}`
  }
  if (from) return `Formatura a partir de ${formatYearMonth(from)}`
  if (to) return `Formatura até ${formatYearMonth(to)}`
  return null
}

function englishLabel(req: Requirements): string | null {
  if (!req.english) return null
  const label = ENGLISH_REQUIRED_LABELS[req.english_level ?? 'nenhum']
  return req.english === 'diferencial' ? `${label} (diferencial)` : label
}

/** Short tags for what the posting asks of candidates (course lists are shown only as conflicts). */
export function requirementTags(req: Requirements): { key: string; label: string }[] {
  const tags = [
    { key: 'hours', label: req.weekly_hours ? `${req.weekly_hours}h/semana` : null },
    { key: 'english', label: englishLabel(req) },
    { key: 'degree', label: req.degree_required ? 'Superior completo' : null },
    { key: 'semester', label: semesterRange(req.min_semester, req.max_semester) },
    { key: 'graduation', label: graduationRange(req.graduation_from, req.graduation_to) },
  ]
  return tags.filter((tag): tag is { key: string; label: string } => tag.label !== null)
}
