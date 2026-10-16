import { Bookmark, BookmarkCheck } from 'lucide-react'
import type { Job } from '../../api/schemas'
import { useApplications } from '../../hooks/useApplications'
import { STATUS_SHORT } from '../../lib/applications'

/**
 * Save a job to "Minhas candidaturas". A job only saved can be unsaved here; once the visitor
 * has moved it along (applied, in process...), it shows that status and is managed in the tab.
 */
export function SaveJobButton({ job }: { job: Job }) {
  const applications = useApplications()
  if (!applications) return null

  const saved = applications.applications.find((item) => item.job.id === job.id)
  if (saved && saved.status !== 'salva') {
    return (
      <span className="chip border-accent text-ink shrink-0 gap-1">
        <BookmarkCheck aria-hidden className="text-accent size-3.5" />
        {STATUS_SHORT[saved.status]}
      </span>
    )
  }

  const full = !saved && applications.applications.length >= applications.max
  return (
    <button
      type="button"
      className={`btn shrink-0 px-2 py-1 text-xs font-normal ${saved ? 'border-accent bg-accent-soft hover:bg-accent-soft' : ''}`}
      aria-pressed={Boolean(saved)}
      aria-label={saved ? `Salva: ${job.title}` : `Salvar vaga: ${job.title}`}
      title={saved ? 'Remover dos salvos' : full ? 'Lista cheia' : 'Salvar em Minhas candidaturas'}
      disabled={full}
      onClick={() => (saved ? applications.remove(job.id) : applications.save(job))}
    >
      {saved ? (
        <BookmarkCheck aria-hidden className="text-accent size-3.5" />
      ) : (
        <Bookmark aria-hidden className="size-3.5" />
      )}
      {saved ? 'Salva' : 'Salvar'}
    </button>
  )
}
