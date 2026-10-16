import { useCallback, useEffect, useState } from 'react'

export const VIEWS = ['vagas', 'candidaturas', 'mercado'] as const
export type View = (typeof VIEWS)[number]

const PARAM = 'aba'
/** Ids linking each tab to the shared tab panel (WAI-ARIA tabs). */
export const PANEL_ID = 'dashboard-panel'
export const tabId = (view: View) => `tab-${view}`
const DEFAULT_VIEW: View = 'vagas'

/** Anything other than a known view falls back to the default ("vagas"). */
export function parseView(search: string): View {
  const value = new URLSearchParams(search).get(PARAM)
  return VIEWS.find((view) => view === value) ?? DEFAULT_VIEW
}

/** The default view is not written, so plain links stay clean; other params are preserved. */
export function viewToSearch(view: View, current: string): string {
  const params = new URLSearchParams(current)
  if (view === DEFAULT_VIEW) params.delete(PARAM)
  else params.set(PARAM, view)
  const query = params.toString()
  return query ? `?${query}` : ''
}

/**
 * Active dashboard tab, mirrored in the URL. Switching tabs pushes a history entry, so the
 * browser's back button returns to the previous tab.
 */
export function useView() {
  const [view, setView] = useState<View>(() => parseView(window.location.search))

  useEffect(() => {
    const onPopState = () => setView(parseView(window.location.search))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const changeView = useCallback((next: View) => {
    setView(next)
    const search = viewToSearch(next, window.location.search)
    if (search !== window.location.search) {
      window.history.pushState(null, '', `${window.location.pathname}${search}`)
    }
  }, [])

  return { view, changeView }
}
