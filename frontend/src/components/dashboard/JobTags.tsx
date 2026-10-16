import type { Job } from '../../api/schemas'
import { jobTags } from '../../lib/jobTags'

export function JobTags({ job, isNew = false }: { job: Job; isNew?: boolean }) {
  const tags = jobTags(job, { isNew })
  if (tags.length === 0) return null
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Características da vaga">
      {tags.map((tag) => (
        <li
          key={tag.key}
          title={tag.hint}
          className={`chip ${tag.highlight ? 'border-accent text-ink' : ''}`}
        >
          {tag.label}
        </li>
      ))}
    </ul>
  )
}
