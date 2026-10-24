import { Check, ExternalLink, Gift } from 'lucide-react'
import type { Job, Match } from '../../api/schemas'
import { useViewed } from '../../hooks/useViewed'
import { formatDate, formatNumber, formatPercent } from '../../lib/format'
import { AREA_LABELS, BENEFIT_LABELS, LEVEL_LABELS, SOURCE_LABELS } from '../../lib/labels'
import { SaveJobButton } from '../applications/SaveJobButton'
import { toSafeHref } from '../../lib/safeUrl'
import { formatViewed } from '../../lib/viewed'
import { JobTags } from './JobTags'
import { LearnLink } from './LearnLink'

const MAX_PLAIN_SKILLS = 6
const MAX_NICE_SKILLS = 4
const MAX_BENEFITS = 6
/** A match on this many detected skills or fewer says little about the job. */
const FEW_SKILLS = 1

/**
 * One job posting. With match data (the visitor has a skills profile) it also shows what they
 * have (✓), what is missing and the coverage; otherwise just the skills the posting asks for.
 * "Diferencial" skills are shown apart and never count as missing.
 */
export function JobRow({
  job,
  skillName,
  skillShare,
  known = [],
  isNew = false,
}: {
  job: Job | Match
  skillName: (slug: string) => string
  /** Share of all jobs that ask for a skill, to say how much a missing one is worth. */
  skillShare?: ((slug: string) => number | undefined) | undefined
  /** The visitor's skills, to tick the "diferencial" ones they already have. */
  known?: readonly string[]
  /** First collected after the visitor's previous visit. */
  isNew?: boolean
}) {
  const viewed = useViewed()
  const viewedAt = viewed?.viewed[job.id]
  const href = toSafeHref(job.url)
  const match = 'coverage' in job ? job : undefined
  const detected = match ? match.matched.length + match.missing.length : 0
  const details = [
    job.company,
    job.location,
    `${LEVEL_LABELS[job.level]} · ${AREA_LABELS[job.area]}`,
    SOURCE_LABELS[job.source],
    job.published_at && formatDate(job.published_at),
  ].filter(Boolean)
  const plain = job.skills.slice(0, MAX_PLAIN_SKILLS)
  const hidden = job.skills.length - plain.length
  const nice = job.nice_to_have.slice(0, MAX_NICE_SKILLS)
  const hiddenNice = job.nice_to_have.length - nice.length
  const benefits = job.benefits.slice(0, MAX_BENEFITS)
  const hiddenBenefits = job.benefits.slice(MAX_BENEFITS)

  return (
    <li className="border-line flex flex-col gap-3 border-b py-3 first:pt-0 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-ink hover:text-accent inline-flex items-start gap-1 font-medium"
              onClick={() => viewed?.markViewed(job.id)}
              onAuxClick={() => viewed?.markViewed(job.id)}
            >
              <span>{job.title}</span>
              <ExternalLink aria-hidden className="mt-0.5 size-3.5 shrink-0 opacity-60" />
              <span className="sr-only">(abre em nova aba)</span>
            </a>
          ) : (
            <span className="text-ink font-medium">{job.title}</span>
          )}
          <SaveJobButton job={job} />
        </div>
        <p className="text-muted mt-0.5 text-xs">
          {details.join(' · ')}
          {viewedAt && (
            <>
              {' · '}
              <span className="text-ink-2 font-medium">{formatViewed(viewedAt)}</span>
            </>
          )}
        </p>
        <JobTags job={job} isNew={isNew} />
        {match && <MatchSummary match={match} skillName={skillName} skillShare={skillShare} />}

        <ul className="mt-2 flex flex-wrap gap-1" aria-label="Competências pedidas na vaga">
          {match ? (
            <>
              {match.matched.map((slug) => (
                <li key={slug} className="chip gap-1">
                  <Check aria-hidden className="text-success size-3" />
                  {skillName(slug)}
                  <span className="sr-only">(você tem)</span>
                </li>
              ))}
              {match.missing.map((slug) => (
                <li key={slug} className="chip border-accent text-ink border-dashed">
                  <span className="text-muted mr-1">Falta</span>
                  {skillName(slug)}
                </li>
              ))}
            </>
          ) : (
            <>
              {plain.map((slug) => (
                <li key={slug} className="chip">
                  {skillName(slug)}
                </li>
              ))}
              {hidden > 0 && <li className="chip">+{hidden}</li>}
            </>
          )}
        </ul>
        {nice.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1" aria-label="Diferenciais (não obrigatórios)">
            {nice.map((slug) => {
              const has = known.includes(slug)
              return (
                <li key={slug} className="chip text-ink-2 gap-1 border-dotted">
                  {has ? (
                    <Check aria-hidden className="text-success size-3" />
                  ) : (
                    <span className="text-muted">Diferencial</span>
                  )}
                  {skillName(slug)}
                  {has && <span className="sr-only">(diferencial que você tem)</span>}
                </li>
              )
            })}
            {hiddenNice > 0 && <li className="chip text-ink-2 border-dotted">+{hiddenNice}</li>}
          </ul>
        )}
        {benefits.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1" aria-label="Benefícios citados no anúncio">
            {benefits.map((benefit) => (
              <li key={benefit} className="chip text-ink-2 gap-1">
                <Gift aria-hidden className="text-accent size-3" />
                {BENEFIT_LABELS[benefit]}
              </li>
            ))}
            {hiddenBenefits.length > 0 && (
              <li
                className="chip text-ink-2"
                title={hiddenBenefits.map((benefit) => BENEFIT_LABELS[benefit]).join(', ')}
              >
                +{hiddenBenefits.length}
                <span className="sr-only">
                  : {hiddenBenefits.map((benefit) => BENEFIT_LABELS[benefit]).join(', ')}
                </span>
              </li>
            )}
          </ul>
        )}
      </div>

      {match && (
        <div className="flex shrink-0 items-center gap-3 sm:w-36 sm:flex-col sm:items-end sm:gap-1">
          <span className="text-ink text-lg leading-none font-semibold tabular-nums">
            {formatPercent(match.coverage)}
            <span className="sr-only"> de compatibilidade</span>
          </span>
          <div className="bg-surface-2 h-1.5 w-24 overflow-hidden rounded-full" aria-hidden>
            <div
              className="h-full rounded-full"
              style={{ width: `${match.coverage * 100}%`, background: 'var(--series-1)' }}
            />
          </div>
          <span className="text-muted text-xs">
            você tem {formatNumber(match.matched.length)} de{' '}
            {formatNumber(match.matched.length + match.missing.length)}
          </span>
        </div>
      )}
    </li>
  )
}

/** What closes the gap: the one missing skill (with where to learn it) or the one to start with. */
function MatchSummary({
  match,
  skillName,
  skillShare,
}: {
  match: Match
  skillName: (slug: string) => string
  skillShare?: ((slug: string) => number | undefined) | undefined
}) {
  const [first] = match.missing
  // Nothing missing: the 100% coverage already says it.
  if (first === undefined) return null
  const name = skillName(first)
  const share = skillShare?.(first)
  const demand = share ? `, pedida em ${formatPercent(share)} das vagas` : ''
  return (
    <p className="text-ink-2 mt-2 text-xs">
      {match.missing.length === 1 ? (
        <>
          Falta só <strong className="text-ink font-medium">{name}</strong>
          {demand}. <LearnLink slug={first} name={name} />
        </>
      ) : (
        <>
          Faltam {formatNumber(match.missing.length)}: comece por{' '}
          <strong className="text-ink font-medium">{name}</strong>
          {share ? `, a mais pedida delas (${formatPercent(share)} das vagas)` : ''}.
        </>
      )}
    </p>
  )
}
