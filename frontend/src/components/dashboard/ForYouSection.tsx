import { Check, Plus, Sparkles, Target, X } from 'lucide-react'
import { useId } from 'react'
import type { Filters } from '../../api/endpoints'
import type { Meta } from '../../api/schemas'
import { useGap } from '../../hooks/useDashboardData'
import type { KnownSkills } from '../../hooks/useKnownSkills'
import { formatNumber, formatPercent } from '../../lib/format'
import type { SeenFilter } from '../../lib/viewed'
import { CATEGORY_LABELS } from '../../lib/labels'
import { EmptyState, ErrorState, LoadingState } from '../feedback/States'
import { CvImport } from './CvImport'
import { SkillOptions } from './FilterBar'
import { JobList } from './JobList'
import { LearnLink } from './LearnLink'

const MAX_SUGGESTIONS = 8
const SUGGEST_UNTIL = 5

interface ForYouProps {
  filters: Filters
  meta: Meta
  profile: KnownSkills
  /** \`profile.known\` restricted to skills present in the dataset. */
  known: readonly string[]
  /** End of the visitor's previous visit (ISO), to flag new jobs. */
  lastVisit?: string | null
  /** The "Vistas" filter of the job list. */
  seen?: SeenFilter | null
}

/**
 * The "Vagas" tab: (1) say what you know, (2) see the jobs (ranked once a profile exists),
 * (3) see what to learn next. Everything respects the filters; the profile stays in this browser.
 */
export function ForYouSection({
  filters,
  meta,
  profile,
  known,
  lastVisit = null,
  seen = null,
}: ForYouProps) {
  const headingId = useId()
  const nameOf = (slug: string) => meta.skills.find((skill) => skill.slug === slug)?.name ?? slug

  return (
    <section aria-labelledby={headingId} className="card flex flex-col gap-5 p-4 sm:p-5">
      <header>
        <h2 id={headingId} className="flex items-center gap-1.5 text-base font-semibold">
          <Target aria-hidden className="text-accent size-4" />
          Seu perfil
        </h2>
        <p className="text-muted mt-0.5 max-w-3xl text-sm">
          Marque o que você já sabe (ou envie seu currículo): as vagas passam a ser ordenadas pelo
          que combina com você e mostramos o que aprender a seguir. Fica salvo só neste navegador.
        </p>
      </header>

      <SkillPicker meta={meta} profile={profile} known={known} nameOf={nameOf} />
      <CvImport meta={meta} profile={profile} known={known} />

      <div className="border-line grid gap-6 border-t pt-5 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <JobList filters={filters} meta={meta} known={known} lastVisit={lastVisit} seen={seen} />
        </div>
        <div className="border-line min-w-0 border-t pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          <LearnNext filters={filters} known={known} onAdd={profile.add} />
        </div>
      </div>
    </section>
  )
}

function SkillPicker({
  meta,
  profile,
  known,
  nameOf,
}: {
  meta: Meta
  profile: KnownSkills
  known: readonly string[]
  nameOf: (slug: string) => string
}) {
  const selectId = useId()
  const { add, remove, clear, max } = profile
  const full = known.length >= max
  // Quick start: the market's most requested skills the visitor has not marked yet.
  const suggestions =
    known.length < SUGGEST_UNTIL
      ? meta.skills
          .filter((skill) => skill.count > 0 && !known.includes(skill.slug))
          .slice(0, MAX_SUGGESTIONS)
      : []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-full flex-col gap-1.5 sm:w-80">
          <label htmlFor={selectId} className="text-muted text-xs font-medium">
            Suas competências ({known.length}/{max})
          </label>
          <select
            id={selectId}
            className="select w-full"
            value=""
            disabled={full}
            onChange={(event) => event.target.value && add(event.target.value)}
          >
            <option value="">Adicionar competência…</option>
            <SkillOptions skills={meta.skills} exclude={known} />
          </select>
        </div>
        {known.length > 0 && (
          <button type="button" className="btn" onClick={clear}>
            Limpar
          </button>
        )}
      </div>

      {known.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Competências que você tem">
          {known.map((slug) => (
            <li key={slug}>
              <button
                type="button"
                onClick={() => remove(slug)}
                className="border-line bg-surface-2 text-ink hover:border-accent inline-flex items-center gap-1 rounded-full border py-0.5 pr-1.5 pl-2.5 text-sm"
                aria-label={`Remover ${nameOf(slug)}`}
              >
                {nameOf(slug)}
                <X aria-hidden className="text-muted size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 && !full && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted text-xs">Mais pedidas:</span>
          {suggestions.map((skill) => (
            <button
              key={skill.slug}
              type="button"
              onClick={() => add(skill.slug)}
              className="border-line text-ink-2 hover:border-accent hover:text-ink inline-flex items-center gap-1 rounded-full border border-dashed py-0.5 pr-2.5 pl-1.5 text-sm"
              aria-label={`Adicionar ${skill.name}`}
            >
              <Plus aria-hidden className="size-3.5" />
              {skill.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Coverage of the profile and the missing skills that open the most doors. */
function LearnNext({
  filters,
  known,
  onAdd,
}: {
  filters: Filters
  known: readonly string[]
  onAdd: (slug: string) => void
}) {
  const query = useGap(filters, known)
  const headingId = useId()

  let body
  if (known.length === 0) {
    body = (
      <p className="text-muted bg-surface-2 rounded-lg p-4 text-sm">
        Marque as competências que você tem (ou clique nas sugestões acima). Aqui aparecem as que
        mais aproximam você das vagas e quantas ficam prontas para aplicar com cada uma.
      </p>
    )
  } else if (query.isPending) {
    body = <LoadingState height={260} />
  } else if (query.isError && !query.data) {
    body = <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  } else if (query.data.total_jobs === 0) {
    body = <EmptyState title="Nenhuma vaga com competências identificadas para esses filtros" />
  } else {
    const gap = query.data
    const maxShare = Math.max(...gap.recommendations.map((item) => item.share), 0.01)
    body = (
      <div
        className={`flex flex-col gap-4 transition-opacity ${query.isFetching && query.isPlaceholderData ? 'opacity-50' : ''}`}
      >
        <ol className="flex flex-col gap-3">
          {gap.recommendations.map((item, index) => (
            <li key={item.slug} className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-x-2">
              <span className="text-muted text-xs tabular-nums">{index + 1}</span>
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-ink truncate text-sm font-medium">{item.name}</span>
                  <span className="text-ink-2 shrink-0 text-sm tabular-nums">
                    {formatPercent(item.share)}
                  </span>
                </div>
                <div className="bg-surface-2 mt-1 h-1.5 overflow-hidden rounded-full" aria-hidden>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(item.share / maxShare) * 100}%`,
                      background: 'var(--series-1)',
                    }}
                  />
                </div>
                <p className="text-muted mt-0.5 text-xs">{CATEGORY_LABELS[item.category]}</p>
                {/* Jobs where this is the only missing skill: learning it makes them ready. */}
                {item.unlocks > 0 && (
                  <p className="text-ink-2 mt-0.5 text-xs">
                    Aprendendo, você se aproxima de{' '}
                    <span className="whitespace-nowrap">
                      +{formatNumber(item.unlocks)} vaga{item.unlocks > 1 ? 's' : ''}
                    </span>
                  </p>
                )}
                <p className="mt-0.5 empty:hidden">
                  <LearnLink slug={item.slug} name={item.name} />
                </p>
              </div>
              <button
                type="button"
                className="btn px-2 py-1 text-xs"
                onClick={() => onAdd(item.slug)}
                aria-label={`Já sei ${item.name}: adicionar ao meu perfil`}
              >
                <Check aria-hidden className="size-3.5" />
                Já sei
              </button>
            </li>
          ))}
        </ol>
        <p className="text-muted text-xs">% = vagas filtradas que pedem a competência.</p>
      </div>
    )
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <header>
        <h3 id={headingId} className="text-ink flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles aria-hidden className="text-accent size-4" />O que aprender a seguir
        </h3>
        <p className="text-muted mt-0.5 text-sm">
          As competências que mais aproximam você das vagas.
        </p>
      </header>
      {body}
    </section>
  )
}
