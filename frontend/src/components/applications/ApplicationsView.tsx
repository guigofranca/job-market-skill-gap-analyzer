import { AlarmClock, ClipboardList, ExternalLink, Trash2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useJobsByIds } from '../../hooks/useDashboardData'
import type { Applications } from '../../hooks/useApplications'
import {
  closingSoon,
  CLOSING_SOON_DAYS,
  MAX_NOTE_CHARS,
  sortApplications,
  STATUSES,
  STATUS_LABELS,
  STATUS_SHORT,
  type Application,
} from '../../lib/applications'
import { formatDate, formatDateTime, formatDeadline, formatNumber } from '../../lib/format'
import { AREA_LABELS, LEVEL_LABELS, SOURCE_LABELS } from '../../lib/labels'
import { toSafeHref } from '../../lib/safeUrl'
import { EmptyState } from '../feedback/States'

/**
 * "Minhas candidaturas": the jobs the visitor saved, where they are with each one, deadlines
 * and whether the posting is still published. Everything stays in this browser.
 */
export function ApplicationsView({
  applications,
  onGoToJobs,
}: {
  applications: Applications
  onGoToJobs: () => void
}) {
  const headingId = useId()
  const { applications: items, refresh } = applications
  const lookup = useJobsByIds(items.map((item) => item.job.id))

  // Postings change: keep the saved deadlines current while the job is still published.
  useEffect(() => {
    if (lookup.jobs.length > 0) refresh(lookup.jobs)
  }, [lookup.jobs, refresh])

  const checked = !lookup.isPending && !lookup.isError
  const open = new Set(lookup.jobs.map((job) => job.id))
  const urgent = closingSoon(items)
  const sorted = sortApplications(items)

  return (
    <section aria-labelledby={headingId} className="card flex flex-col gap-5 p-4 sm:p-5">
      <header>
        <h2 id={headingId} className="flex items-center gap-1.5 text-base font-semibold">
          <ClipboardList aria-hidden className="text-accent size-4" />
          Minhas candidaturas
        </h2>
        <p className="text-muted mt-0.5 max-w-3xl text-sm">
          Acompanhe as vagas que você salvou: em que etapa está cada uma, prazos e anotações. Fica
          salvo só neste navegador.
        </p>
        {items.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Resumo por etapa">
            {STATUSES.map((status) => {
              const count = items.filter((item) => item.status === status).length
              return count > 0 ? (
                <li key={status} className="chip">
                  {STATUS_SHORT[status]}: {formatNumber(count)}
                </li>
              ) : null
            })}
          </ul>
        )}
      </header>

      {items.length === 0 ? (
        <EmptyState title="Nenhuma vaga salva ainda">
          <p>
            Na aba Vagas, use o botão <strong>Salvar</strong> de cada vaga para acompanhá-la aqui.
          </p>
          <button type="button" className="btn mt-3" onClick={onGoToJobs}>
            Ver vagas
          </button>
        </EmptyState>
      ) : (
        <>
          {urgent.length > 0 && <ClosingSoon items={urgent} />}
          {STATUSES.map((status) => {
            const group = sorted.filter((item) => item.status === status)
            if (group.length === 0) return null
            return (
              <section key={status} aria-label={STATUS_SHORT[status]} className="flex flex-col">
                <h3 className="text-ink-2 border-line border-b pb-1.5 text-sm font-semibold">
                  {STATUS_SHORT[status]} ({formatNumber(group.length)})
                </h3>
                <ul>
                  {group.map((item) => (
                    <ApplicationItem
                      key={item.job.id}
                      item={item}
                      published={checked ? open.has(item.job.id) : null}
                      applications={applications}
                    />
                  ))}
                </ul>
              </section>
            )
          })}
        </>
      )}
    </section>
  )
}

function ClosingSoon({ items }: { items: readonly Application[] }) {
  return (
    <div className="border-accent bg-accent-soft rounded-lg border p-3 text-sm">
      <p className="text-ink flex items-center gap-1.5 font-medium">
        <AlarmClock aria-hidden className="text-accent size-4" />
        {items.length === 1
          ? `1 vaga salva encerra nos próximos ${CLOSING_SOON_DAYS} dias e você ainda não se candidatou`
          : `${formatNumber(items.length)} vagas salvas encerram nos próximos ${CLOSING_SOON_DAYS} dias e você ainda não se candidatou`}
      </p>
      <ul className="text-ink-2 mt-1.5 flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item.job.id}>
            {item.job.title}
            {item.job.company && ` · ${item.job.company}`} —{' '}
            <span className="text-ink font-medium">
              {item.job.deadline && formatDeadline(item.job.deadline)?.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ApplicationItem({
  item,
  published,
  applications,
}: {
  item: Application
  /** null while unknown (loading or the API is unavailable). */
  published: boolean | null
  applications: Applications
}) {
  const { job } = item
  const statusId = useId()
  const noteId = useId()
  const [note, setNote] = useState(item.note)
  const href = toSafeHref(job.url)
  const deadline = job.deadline ? formatDeadline(job.deadline) : null
  const closed = job.deadline !== null && deadline === null
  const details = [
    job.company,
    job.location,
    `${LEVEL_LABELS[job.level]} · ${AREA_LABELS[job.area]}`,
    SOURCE_LABELS[job.source],
  ].filter(Boolean)

  return (
    <li className="border-line flex flex-col gap-2.5 border-b py-3 last:border-0">
      <div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-ink hover:text-accent inline-flex items-start gap-1 font-medium"
          >
            <span>{job.title}</span>
            <ExternalLink aria-hidden className="mt-0.5 size-3.5 shrink-0 opacity-60" />
            <span className="sr-only">(abre em nova aba)</span>
          </a>
        ) : (
          <span className="text-ink font-medium">{job.title}</span>
        )}
        <p className="text-muted mt-0.5 text-xs">{details.join(' · ')}</p>
        <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Situação da vaga">
          {deadline && (
            <li className={`chip ${deadline.soon ? 'border-accent text-ink' : ''}`}>
              {deadline.label}
            </li>
          )}
          {closed && job.deadline && (
            <li className="chip">Inscrições encerradas em {formatDate(job.deadline)}</li>
          )}
          {published === false && (
            <li className="chip" title="A vaga saiu da fonte: foi encerrada ou removida">
              Não está mais publicada
            </li>
          )}
          <li className="text-muted px-1 py-0.5 text-xs">
            Salva em {formatDateTime(item.savedAt)}
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-full flex-col gap-1 sm:w-56">
          <label htmlFor={statusId} className="text-muted text-xs font-medium">
            Etapa
          </label>
          <select
            id={statusId}
            className="select w-full"
            value={item.status}
            onChange={(event) => {
              const status = STATUSES.find((value) => value === event.target.value)
              if (status) applications.setStatus(job.id, status)
            }}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={noteId} className="text-muted text-xs font-medium">
            Anotação
          </label>
          <input
            id={noteId}
            type="text"
            className="select w-full"
            maxLength={MAX_NOTE_CHARS}
            placeholder="Ex.: entrevista dia 20, falar com a recrutadora…"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => note !== item.note && applications.setNote(job.id, note)}
          />
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => applications.remove(job.id)}
          aria-label={`Remover ${job.title} da lista`}
        >
          <Trash2 aria-hidden className="size-4" />
          Remover
        </button>
      </div>
    </li>
  )
}
