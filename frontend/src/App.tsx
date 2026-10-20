import { AlarmClock } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Filters } from './api/endpoints'
import { ApplicationsView } from './components/applications/ApplicationsView'
import { KpiTiles } from './components/dashboard/KpiTiles'
import { FilterBar } from './components/dashboard/FilterBar'
import { ForYouSection } from './components/dashboard/ForYouSection'
import {
  CategorySection,
  LevelComparisonSection,
  LocationsSection,
  TopSkillsSection,
  WorkplaceSection,
} from './components/dashboard/Sections'
import { ErrorBoundary } from './components/feedback/ErrorBoundary'
import { SectionFallback } from './components/feedback/Fallbacks'
import { ErrorState, LoadingState } from './components/feedback/States'
import { Footer, Header } from './components/layout/Header'
import { ViewTabs } from './components/layout/ViewTabs'
import { getConfig } from './config/env'
import { useMeta, useSummary } from './hooks/useDashboardData'
import { ApplicationsContext, useApplicationsState } from './hooks/useApplications'
import { useFilters } from './hooks/useFilters'
import { useKnownSkills } from './hooks/useKnownSkills'
import { useLastVisit } from './hooks/useLastVisit'
import { useTheme } from './hooks/useTheme'
import { PANEL_ID, tabId, useView } from './hooks/useView'
import { ViewedContext, useViewedState } from './hooks/useViewed'
import { closingSoon, CLOSING_SOON_DAYS } from './lib/applications'
import type { SeenFilter } from './lib/viewed'
import { staleFilters } from './lib/filters'

export default function App() {
  getConfig() // validates VITE_* settings; a ConfigError is rendered by the root boundary
  const { theme, toggleTheme } = useTheme()
  const meta = useMeta()

  return (
    <div className="flex min-h-dvh flex-col">
      <Header meta={meta.data} loading={meta.isPending} theme={theme} onToggleTheme={toggleTheme} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
        {meta.isPending ? (
          // A screen tall, so the footer stays below the fold until the dashboard replaces it.
          <div className="min-h-dvh">
            <LoadingState height={420} label="Carregando painel…" />
          </div>
        ) : meta.isError ? (
          <ErrorState error={meta.error} onRetry={() => void meta.refetch()} />
        ) : (
          <Dashboard meta={meta.data} />
        )}
      </main>
      <Footer />
    </div>
  )
}

function Dashboard({ meta }: { meta: NonNullable<ReturnType<typeof useMeta>['data']> }) {
  const { filters: urlFilters, updateFilters, resetFilters } = useFilters()

  // A shared link may carry values with no jobs in this dataset (technology, state, city): ignore
  // them before any request is made, then remove them from the URL.
  const stale = useMemo(() => staleFilters(urlFilters, meta), [urlFilters, meta])
  const filters = useMemo<Filters>(() => ({ ...urlFilters, ...stale }), [urlFilters, stale])
  useEffect(() => {
    if (Object.keys(stale).length > 0) updateFilters(stale)
  }, [stale, updateFilters])
  const { view, changeView } = useView()
  const lastVisit = useLastVisit()
  const applications = useApplicationsState()
  const viewed = useViewedState()
  const [seen, setSeen] = useState<SeenFilter | null>(null)
  const urgent = closingSoon(applications.applications)

  // The skills profile drives the job ranking and "what to learn next". Stored slugs that are not
  // in the current dataset (taxonomy changed, tampered storage) are ignored.
  const profile = useKnownSkills()
  const known = useMemo(
    () => profile.known.filter((slug) => meta.skills.some((skill) => skill.slug === slug)),
    [profile.known, meta.skills],
  )

  const resetKeys = [
    filters.level,
    filters.area,
    filters.skill,
    filters.state,
    filters.city,
    filters.workplace,
    filters.inclusion,
  ]

  return (
    <ApplicationsContext value={applications}>
      <ViewedContext value={viewed}>
        {urgent.length > 0 && view !== 'candidaturas' && (
          <p className="border-accent bg-accent-soft text-ink flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-sm">
            <AlarmClock aria-hidden className="text-accent size-4 shrink-0" />
            {urgent.length === 1
              ? `1 vaga salva encerra nos próximos ${CLOSING_SOON_DAYS} dias e você ainda não se candidatou.`
              : `${urgent.length} vagas salvas encerram nos próximos ${CLOSING_SOON_DAYS} dias e você ainda não se candidatou.`}
            <button
              type="button"
              className="text-accent hover:text-ink font-medium underline transition-colors"
              onClick={() => changeView('candidaturas')}
            >
              Ver minhas candidaturas
            </button>
          </p>
        )}
        <ViewTabs
          view={view}
          onChange={changeView}
          counts={{ candidaturas: applications.applications.length }}
        />
        {view !== 'candidaturas' && (
          <FilterBar
            meta={meta}
            filters={filters}
            onChange={updateFilters}
            onReset={() => {
              resetFilters()
              setSeen(null)
            }}
            {...(view === 'vagas' && {
              seen: {
                mode: seen?.mode ?? null,
                onChange: (mode) => setSeen(mode && { mode, ids: viewed.ids }),
              },
            })}
          />
        )}

        <div
          id={PANEL_ID}
          role="tabpanel"
          aria-labelledby={tabId(view)}
          className="flex flex-col gap-5"
        >
          {view === 'vagas' ? (
            <Guarded title="Vagas" resetKeys={resetKeys}>
              <ForYouSection
                filters={filters}
                meta={meta}
                profile={profile}
                known={known}
                lastVisit={lastVisit}
                seen={seen}
              />
            </Guarded>
          ) : view === 'candidaturas' ? (
            <Guarded title="Minhas candidaturas" resetKeys={[]}>
              <ApplicationsView
                applications={applications}
                onGoToJobs={() => changeView('vagas')}
              />
            </Guarded>
          ) : (
            <MarketView
              filters={filters}
              meta={meta}
              resetKeys={resetKeys}
              onSelectSkill={(slug) => updateFilters({ skill: slug })}
              onFilter={updateFilters}
            />
          )}
        </div>
      </ViewedContext>
    </ApplicationsContext>
  )
}

/** The "Mercado" tab: what the filtered postings ask for, in aggregate. */
function MarketView({
  filters,
  meta,
  resetKeys,
  onSelectSkill,
  onFilter,
}: {
  filters: Filters
  meta: NonNullable<ReturnType<typeof useMeta>['data']>
  resetKeys: readonly unknown[]
  onSelectSkill: (slug: string) => void
  onFilter: (patch: Partial<Filters>) => void
}) {
  const summary = useSummary(filters)
  const selectedSkill = meta.skills.find((skill) => skill.slug === filters.skill)
  const selectedState = meta.states.find((state) => state.key === filters.state)

  return (
    <>
      <Guarded title="Indicadores" resetKeys={resetKeys}>
        <KpiTiles
          query={summary}
          totalJobs={meta.total_jobs}
          selectedSkillName={selectedSkill?.name}
        />
      </Guarded>

      {/* Two independent columns (not rows), paired so both stacks are about the same height;
          the last chart of each column grows into what is left, so both end together. */}
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-3">
          <Guarded title="Competências mais exigidas" resetKeys={resetKeys}>
            <TopSkillsSection
              filters={filters}
              skillName={selectedSkill?.name}
              onSelectSkill={onSelectSkill}
            />
          </Guarded>
          <Guarded title="Modalidade" resetKeys={resetKeys} className="flex flex-1 flex-col">
            <WorkplaceSection filters={filters} grow />
          </Guarded>
        </div>
        <div className="flex min-w-0 flex-col gap-5 lg:col-span-2">
          <Guarded title="Categorias" resetKeys={resetKeys}>
            <CategorySection query={summary} />
          </Guarded>
          <Guarded
            title="Onde estão as vagas"
            resetKeys={resetKeys}
            className="flex flex-1 flex-col"
          >
            <LocationsSection
              filters={filters}
              stateName={selectedState?.label}
              onFilter={onFilter}
              grow
            />
          </Guarded>
        </div>
      </div>

      <Guarded title="Estágio × Júnior" resetKeys={resetKeys}>
        <LevelComparisonSection filters={filters} />
      </Guarded>
    </>
  )
}

/** Per-section error boundary: a crash in one widget leaves the rest of the dashboard usable. */
function Guarded({
  title,
  resetKeys,
  className,
  children,
}: {
  title: string
  resetKeys: readonly unknown[]
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <ErrorBoundary
        resetKeys={resetKeys}
        fallback={(_, reset) => <SectionFallback title={title} reset={reset} />}
      >
        {children}
      </ErrorBoundary>
    </div>
  )
}
