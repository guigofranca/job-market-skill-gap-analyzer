import { Check, ChevronDown, Link2, Plus, Sparkles, Target, X } from 'lucide-react'
import { useId, useState } from 'react'
import type { Filters } from '../../api/endpoints'
import type { Gap, Meta } from '../../api/schemas'
import { useGap, useTopSkills } from '../../hooks/useDashboardData'
import type { KnownSkills } from '../../hooks/useKnownSkills'
import { useSharedProfile } from '../../hooks/useSharedProfile'
import { formatNumber, formatPercent } from '../../lib/format'
import { profileLink } from '../../lib/profileLink'
import type { SeenFilter } from '../../lib/viewed'
import { CATEGORY_LABELS } from '../../lib/labels'
import { EmptyState, ErrorState, LoadingState } from '../feedback/States'
import { CvImport } from './CvImport'
import { JobList } from './JobList'
import { LearnLink } from './LearnLink'
import { SkillCombobox } from './SkillCombobox'

const MAX_SUGGESTIONS = 8
const SUGGEST_UNTIL = 5
const MAX_LEARN = 8
const SUMMARY_NAMES = 3

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
  const bodyId = useId()
  // Phones: the profile folds behind one line, so the first screen shows jobs, not a form.
  const [mobileOpen, setMobileOpen] = useState(false)
  const nameOf = (slug: string) => meta.skills.find((skill) => skill.slug === slug)?.name ?? slug
  const summary = known.length === 0 ? 'Marque o que você já sabe' : listNames(known, nameOf)
  const link = useSharedProfile(profile)
  // Skills of the link this dataset knows (the others are ignored, as in the stored profile).
  const shared = link.shared?.filter((slug) => meta.skills.some((skill) => skill.slug === slug))

  return (
    <section aria-labelledby={headingId} className="card flex flex-col gap-5 p-4 sm:p-5">
      <header className="flex flex-col gap-3">
        <h2 id={headingId} className="flex items-center gap-1.5 text-base font-semibold">
          <Target aria-hidden className="text-accent size-4" />
          Seu perfil
        </h2>
        <button
          type="button"
          className="btn justify-between text-left sm:hidden"
          aria-expanded={mobileOpen}
          aria-controls={bodyId}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <span className="min-w-0 truncate">{summary}</span>
          <ChevronDown
            aria-hidden
            className={`size-4 shrink-0 transition-transform ${mobileOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {shared && shared.length > 0 && (
          <div className="border-accent bg-accent-soft text-ink flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2 text-sm">
            <span>
              Este link traz um perfil: <strong>{listNames(shared, nameOf)}</strong>.
            </span>
            <button type="button" className="btn px-2 py-1 text-xs" onClick={link.accept}>
              {known.length === 0 ? 'Ver as vagas para este perfil' : 'Usar este (substitui o seu)'}
            </button>
            <button type="button" className="btn px-2 py-1 text-xs" onClick={link.dismiss}>
              {known.length === 0 ? 'Agora não' : 'Manter o meu'}
            </button>
          </div>
        )}
      </header>

      <div
        id={bodyId}
        className={`${mobileOpen ? 'flex' : 'hidden'} -mt-1 flex-col gap-5 sm:-mt-4 sm:flex`}
      >
        <p className="text-muted max-w-3xl text-sm">
          Marque o que você já sabe (ou envie seu currículo): as vagas passam a ser ordenadas pelo
          que combina com você e mostramos o que aprender a seguir. Fica salvo só neste navegador.
        </p>
        <SkillPicker meta={meta} profile={profile} known={known} nameOf={nameOf} />
        <CvImport meta={meta} profile={profile} known={known} />
      </div>

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
        <SkillCombobox
          label={`Suas competências (${known.length}/${max})`}
          skills={meta.skills}
          exclude={known}
          onSelect={add}
          disabled={full}
        />
        {known.length > 0 && (
          <>
            <ShareProfile known={known} />
            <button type="button" className="btn" onClick={clear}>
              Limpar
            </button>
          </>
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

/** "SQL, Python, Excel e mais 2". */
function listNames(slugs: readonly string[], nameOf: (slug: string) => string): string {
  const more = slugs.length - SUMMARY_NAMES
  return `${slugs.slice(0, SUMMARY_NAMES).map(nameOf).join(', ')}${more > 0 ? ` e mais ${formatNumber(more)}` : ''}`
}

/**
 * Copies a link that opens the dashboard with this profile (and the current filters): to ask a
 * mentor, or to show "what a SQL + Python intern is missing". Phones get the share sheet.
 */
function ShareProfile({ known }: { known: readonly string[] }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle')
  const [url, setUrl] = useState('')

  async function share() {
    const link = profileLink(window.location.href, known)
    setUrl(link)
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'Meu perfil no Empregos e Tendências', url: link })
        return
      }
      await navigator.clipboard.writeText(link)
      setStatus('copied')
      setTimeout(() => setStatus('idle'), 3000)
    } catch (error) {
      // The share sheet was closed: nothing to do. No clipboard access: show the link to copy.
      if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('manual')
    }
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => void share()}>
        <Link2 aria-hidden className="size-4" />
        Compartilhar perfil
      </button>
      {status === 'copied' && <output className="text-ink-2 text-xs">Link copiado!</output>}
      {status === 'manual' && (
        <input
          readOnly
          value={url}
          aria-label="Link do seu perfil (copie)"
          className="select w-full sm:w-80"
          onFocus={(event) => event.target.select()}
        />
      )}
    </>
  )
}

/**
 * What to learn next. With a profile: the missing skills that open the most doors. Without one:
 * the most requested skills of the filtered jobs, so the panel is useful from the first visit.
 */
function LearnNext({
  filters,
  known,
  onAdd,
}: {
  filters: Filters
  known: readonly string[]
  onAdd: (slug: string) => void
}) {
  const hasProfile = known.length > 0
  const gap = useGap(filters, known)
  const top = useTopSkills(filters, MAX_LEARN, !hasProfile)
  const query = hasProfile ? gap : top
  const headingId = useId()
  // With a profile, the shares are among the jobs asking for something the visitor knows (all
  // filtered jobs when none does, or with an API that does not say).
  const related = hasProfile ? gap.data?.related_jobs : undefined
  const intro = !hasProfile
    ? 'As mais pedidas nas vagas filtradas. Marque as que você já sabe para ver o que falta no seu perfil.'
    : related === 0
      ? 'Nenhuma vaga filtrada pede o que você marcou: estas são as mais pedidas.'
      : 'O que mais pedem as vagas que já pedem algo que você sabe.'
  const footnote = related
    ? `% = das ${formatNumber(related)} vagas que pedem algo que você sabe.`
    : '% = vagas filtradas que pedem a competência.'

  let body
  if (query.isPending) {
    body = <LoadingState height={260} />
  } else if (query.isError && !query.data) {
    body = <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  } else {
    const items: LearnItem[] = hasProfile
      ? (gap.data?.recommendations ?? [])
      : (top.data?.items ?? []).map((item) => ({ ...item, unlocks: 0 }))
    const maxShare = Math.max(...items.map((item) => item.share), 0.01)
    body =
      items.length === 0 ? (
        <EmptyState title="Nenhuma vaga com competências identificadas para esses filtros" />
      ) : (
        <div
          aria-busy={query.isFetching && query.isPlaceholderData}
          className={`flex flex-col gap-4 transition-opacity ${query.isFetching && query.isPlaceholderData ? 'opacity-50' : ''}`}
        >
          <ol className="flex flex-col gap-3">
            {items.map((item, index) => (
              <LearnRow
                key={item.slug}
                item={item}
                rank={index + 1}
                maxShare={maxShare}
                onAdd={onAdd}
              />
            ))}
          </ol>
          <p className="text-muted text-xs">{footnote}</p>
        </div>
      )
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <header>
        <h3 id={headingId} className="text-ink flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles aria-hidden className="text-accent size-4" />O que aprender a seguir
        </h3>
        <p className="text-muted mt-0.5 text-sm">{intro}</p>
      </header>
      {body}
    </section>
  )
}

type LearnItem = Gap['recommendations'][number]

function LearnRow({
  item,
  rank,
  maxShare,
  onAdd,
}: {
  item: LearnItem
  rank: number
  maxShare: number
  onAdd: (slug: string) => void
}) {
  return (
    <li className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-x-2">
      <span className="text-muted text-xs tabular-nums">{rank}</span>
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
  )
}
