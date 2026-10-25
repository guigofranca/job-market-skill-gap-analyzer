import { ChevronLeft, ChevronRight, Search, Sparkles } from 'lucide-react'
import { useId, useState } from 'react'
import type { Filters } from '../../api/endpoints'
import type { Matches, Meta } from '../../api/schemas'
import { useJobs, useMatches } from '../../hooks/useDashboardData'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { formatNumber } from '../../lib/format'
import type { SeenFilter } from '../../lib/viewed'
import { isNewSince } from '../../lib/visits'
import { EmptyState, ErrorState, LoadingState } from '../feedback/States'
import { JobRow } from './JobRow'

const PAGE_SIZE = 10

const TABS = [
  {
    key: 'ready',
    label: 'Prontas para aplicar',
    short: 'Prontas',
    missing: 0,
    count: (d: Matches) => d.ready,
  },
  {
    key: 'one',
    label: 'Falta 1 competência',
    short: 'Falta 1',
    missing: 1,
    count: (d: Matches) => d.one_away,
  },
  {
    key: 'all',
    label: 'Todas',
    short: 'Todas',
    missing: undefined,
    count: (d: Matches) => d.total_jobs,
  },
] as const

export type MatchTab = (typeof TABS)[number]['key']

/**
 * The single job list of the "Vagas" tab. Without a skills profile it lists the newest postings;
 * with one, the same postings ranked by how little is missing (tabs: ready / one away / all).
 * Title search and the dashboard filters apply in both modes. Jobs collected since the previous
 * visit are tagged "Nova" and can be listed alone; the "Vistas" filter hides the postings already
 * opened, or lists only them.
 */
export function JobList({
  filters,
  meta,
  known,
  lastVisit = null,
  seen = null,
}: {
  filters: Filters
  meta: Meta
  known: readonly string[]
  /** End of the visitor's previous visit (ISO); null on a first visit. */
  lastVisit?: string | null
  /** The "Vistas" filter, from the filter bar. */
  seen?: SeenFilter | null
}) {
  const ranked = known.length > 0
  const [tab, setTab] = useState<MatchTab>('ready')
  const current = TABS.find((item) => item.key === tab) ?? TABS[0]

  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search.trim(), 350)
  const q = debounced.length >= 2 ? debounced.slice(0, 80) : undefined

  // How many jobs in this scope are new since the last visit (one-row request, total only).
  const newJobs = useJobs(
    filters,
    { limit: 1, offset: 0, ...(q && { q }), ...(lastVisit && { since: lastVisit }) },
    lastVisit !== null,
  )
  const newCount = lastVisit ? (newJobs.data?.total ?? 0) : 0
  const [onlyNewChoice, setOnlyNew] = useState(false)
  const onlyNew = onlyNewChoice && newCount > 0
  const since = onlyNew && lastVisit ? lastVisit : undefined

  // "Só as já vistas" before opening any posting: nothing to list (an empty `ids` means no filter).
  const noneSeen = seen?.mode === 'only' && seen.ids.length === 0

  // Pagination belongs to a scope; changing filters, profile, tab or search starts at page one.
  const scope = JSON.stringify([filters, known, tab, q, since, seen])
  const [page, setPage] = useState({ scope, offset: 0 })
  const offset = page.scope === scope ? page.offset : 0
  const setOffset = (next: number) => setPage({ scope, offset: next })

  const pageParams = {
    limit: PAGE_SIZE,
    offset,
    ...(q && { q }),
    ...(since && { since }),
    ...(seen?.mode === 'hide' && { exclude: seen.ids }),
    ...(seen?.mode === 'only' && { ids: seen.ids }),
  }
  const recent = useJobs(filters, pageParams, !ranked && !noneSeen)
  const matches = useMatches(filters, known, {
    ...pageParams,
    ...(current.missing !== undefined && { missing: current.missing }),
  })
  const query = ranked ? matches : recent
  const data = query.data
  const total = data?.total ?? 0

  const headingId = useId()
  const searchId = useId()
  const skillName = (slug: string) => meta.skills.find((skill) => skill.slug === slug)?.name ?? slug
  const skillShare = (slug: string) => meta.skills.find((skill) => skill.slug === slug)?.share

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id={headingId} className="text-ink text-sm font-semibold">
            {ranked ? 'Vagas que combinam com você' : 'Vagas mais recentes'}
          </h3>
          <p className="text-muted mt-0.5 text-sm">
            {ranked
              ? 'Ordenadas pelo que falta no seu perfil, dentro dos filtros.'
              : 'Marque suas competências acima para ordenar pelas que combinam com você.'}
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <label htmlFor={searchId} className="sr-only">
            Buscar vagas por título
          </label>
          <Search
            aria-hidden
            className="text-muted pointer-events-none absolute top-2 left-2.5 size-4"
          />
          <input
            id={searchId}
            type="search"
            className="select w-full pl-8"
            placeholder="Buscar por título…"
            maxLength={80}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </header>

      {newCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {newCount > 0 && (
            <button
              type="button"
              aria-pressed={onlyNew}
              onClick={() => setOnlyNew(!onlyNew)}
              className={`btn w-fit font-normal ${onlyNew ? 'border-accent bg-accent-soft hover:bg-accent-soft' : ''}`}
            >
              <Sparkles aria-hidden className="text-accent size-3.5" />
              {formatNumber(newCount)}{' '}
              {newCount === 1 ? 'vaga nova para você' : 'vagas novas para você'}
              {onlyNew ? ' · mostrando só elas' : ' desde sua última visita'}
            </button>
          )}
        </div>
      )}

      {ranked && (
        <fieldset className="min-w-0">
          <legend className="sr-only">Mostrar vagas</legend>
          <div className="border-line bg-surface-2 grid grid-cols-3 rounded-lg border p-0.5 sm:flex sm:w-fit">
            {TABS.map((item) => {
              const active = item.key === tab
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTab(item.key)}
                  className="segment px-2 py-1 text-sm sm:px-3"
                >
                  {/* Phones get the short label; the long one is the accessible name there too. */}
                  <span className="sm:hidden" aria-hidden>
                    {item.short}
                  </span>
                  <span className="sr-only sm:not-sr-only">{item.label}</span>
                  {matches.data && (
                    <>
                      {' '}
                      <span className="text-muted tabular-nums">
                        ({formatNumber(item.count(matches.data))})
                      </span>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </fieldset>
      )}

      {noneSeen ? (
        <EmptyState title="Nenhuma vaga vista ainda">
          Abra o anúncio de uma vaga clicando no título: ela passa a aparecer aqui.
        </EmptyState>
      ) : query.isPending ? (
        <LoadingState height={360} />
      ) : query.isError && !data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !data || data.items.length === 0 ? (
        ranked && !q && matches.data && matches.data.total_jobs > 0 ? (
          <NoMatches tab={tab} data={matches.data} onSelectTab={setTab} />
        ) : (
          <EmptyState title="Nenhuma vaga encontrada">Ajuste a busca ou os filtros.</EmptyState>
        )
      ) : (
        <>
          <ul
            aria-label={ranked ? 'Vagas ordenadas por compatibilidade' : 'Vagas mais recentes'}
            aria-busy={query.isFetching && query.isPlaceholderData}
            className={`transition-opacity ${query.isFetching && query.isPlaceholderData ? 'opacity-50' : ''}`}
          >
            {data.items.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                skillName={skillName}
                skillShare={skillShare}
                known={known}
                isNew={isNewSince(job, lastVisit)}
              />
            ))}
          </ul>
          <nav className="flex items-center justify-between gap-3" aria-label="Paginação">
            <span className="text-muted text-sm">
              {formatNumber(offset + 1)}–{formatNumber(Math.min(offset + PAGE_SIZE, total))} de{' '}
              {formatNumber(total)}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                <ChevronLeft aria-hidden className="size-4" />
                Anterior
              </button>
              <button
                type="button"
                className="btn"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Próxima
                <ChevronRight aria-hidden className="size-4" />
              </button>
            </div>
          </nav>
        </>
      )}

      {ranked && matches.data && matches.data.total_jobs > 0 && (
        <p className="text-muted text-xs">
          Considera as {formatNumber(matches.data.total_jobs)} vagas com competências identificadas;
          diferenciais não contam como faltando. A extração é automática: confira os requisitos no
          anúncio original.
        </p>
      )}
    </section>
  )
}

function NoMatches({
  tab,
  data,
  onSelectTab,
}: {
  tab: MatchTab
  data: Matches
  onSelectTab: (tab: MatchTab) => void
}) {
  const next =
    tab === 'ready' && data.one_away > 0
      ? { tab: 'one' as const, label: `Ver as que faltam 1 competência (${data.one_away})` }
      : { tab: 'all' as const, label: `Ver todas (${data.total_jobs})` }
  const title =
    tab === 'ready'
      ? 'Nenhuma vaga 100% compatível com o seu perfil ainda'
      : 'Nenhuma vaga a só 1 competência de distância'

  return (
    <EmptyState title={title}>
      <p>Veja em “O que aprender a seguir” as competências que mais aproximam você das vagas.</p>
      <button type="button" className="btn mt-3" onClick={() => onSelectTab(next.tab)}>
        {next.label}
      </button>
    </EmptyState>
  )
}
