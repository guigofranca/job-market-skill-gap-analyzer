import type { Job } from '../api/schemas'
import { formatDeadline, formatSalary } from './format'
import { AFFIRMATIVE_LABELS, CONTRACT_LABELS, WORKPLACE_LABELS } from './labels'
import { requirementTags } from './requirements'

export interface JobTag {
  key: string
  label: string
  /** Shown on hover. */
  hint?: string
  highlight?: boolean
}

/** What a job seeker scans first: news, deadline, pay, workplace, contract and inclusion. */
export function jobTags(
  job: Job,
  { today = new Date(), isNew = false }: { today?: Date; isNew?: boolean } = {},
): JobTag[] {
  const tags: JobTag[] = []
  if (isNew) {
    tags.push({
      key: 'new',
      label: 'Nova para você',
      hint: 'Publicada e encontrada desde a sua última visita',
      highlight: true,
    })
  }
  // What decides whether to apply right now comes first: deadline and pay.
  const deadline = job.deadline ? formatDeadline(job.deadline, today) : null
  if (deadline) tags.push({ key: 'deadline', label: deadline.label, highlight: deadline.soon })
  const salary = formatSalary(job.salary_min, job.salary_max)
  if (salary) tags.push({ key: 'salary', label: `${salary}/mês` })
  if (job.workplace) tags.push({ key: 'workplace', label: WORKPLACE_LABELS[job.workplace] })
  for (const contract of job.contracts) {
    tags.push({ key: `contract-${contract}`, label: CONTRACT_LABELS[contract] })
  }
  // Who can apply: weekly hours, English, degree, semester, graduation date.
  tags.push(...requirementTags(job.requirements))
  if (job.affirmative.length > 0) {
    const groups = job.affirmative.map((group) => AFFIRMATIVE_LABELS[group]).join(', ')
    tags.push({ key: 'affirmative', label: `Afirmativa: ${groups}`, highlight: true })
  }
  if (job.accepts_pcd && !job.affirmative.includes('pcd')) {
    tags.push({ key: 'pcd', label: 'Aceita PcD' })
  }
  return tags
}
