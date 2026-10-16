import { BarChart3, Briefcase, ClipboardList } from 'lucide-react'
import { useRef, type KeyboardEvent } from 'react'
import { PANEL_ID, tabId, VIEWS, type View } from '../../hooks/useView'

const TABS: Record<View, { label: string; short?: string; icon: typeof Briefcase }> = {
  vagas: { label: 'Vagas', icon: Briefcase },
  candidaturas: { label: 'Minhas candidaturas', short: 'Candidaturas', icon: ClipboardList },
  mercado: { label: 'Mercado', icon: BarChart3 },
}

/**
 * WAI-ARIA tabs: one tab stop, arrow keys / Home / End move between tabs (and activate them).
 */
export function ViewTabs({
  view,
  onChange,
  counts = {},
}: {
  view: View
  onChange: (view: View) => void
  /** Optional badge per tab (e.g. how many saved jobs). */
  counts?: Partial<Record<View, number>>
}) {
  const refs = useRef<Partial<Record<View, HTMLButtonElement | null>>>({})

  const focusAndSelect = (next: View) => {
    onChange(next)
    refs.current[next]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = VIEWS.indexOf(view)
    const moves: Partial<Record<string, number>> = {
      ArrowRight: (index + 1) % VIEWS.length,
      ArrowLeft: (index - 1 + VIEWS.length) % VIEWS.length,
      Home: 0,
      End: VIEWS.length - 1,
    }
    const target = moves[event.key]
    if (target === undefined) return
    event.preventDefault()
    const next = VIEWS[target]
    if (next) focusAndSelect(next)
  }

  return (
    <div
      role="tablist"
      aria-label="Visões do painel"
      // The baseline is an inset shadow (not a border the tabs overlap with a negative margin):
      // nothing sticks out, so the bar never shows a vertical scrollbar. On very narrow screens
      // the tabs scroll sideways, without a visible scrollbar.
      className="flex overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none] sm:gap-1"
    >
      {VIEWS.map((key) => {
        const { label, short, icon: Icon } = TABS[key]
        const active = key === view
        return (
          <button
            key={key}
            ref={(element) => {
              refs.current[key] = element
            }}
            id={tabId(key)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={PANEL_ID}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(key)}
            onKeyDown={onKeyDown}
            className={`inline-flex items-center gap-1 border-b-2 px-2 py-2.5 text-sm whitespace-nowrap transition-colors sm:gap-1.5 sm:px-4 ${
              active
                ? 'border-accent text-ink font-semibold'
                : 'text-ink-2 hover:text-ink hover:border-line border-transparent'
            }`}
          >
            <Icon aria-hidden className="size-4 shrink-0" />
            {short ? (
              <>
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
              </>
            ) : (
              label
            )}
            {counts[key] ? (
              <span className="bg-surface-2 text-ink-2 rounded-full px-1.5 text-xs tabular-nums">
                {counts[key]}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
