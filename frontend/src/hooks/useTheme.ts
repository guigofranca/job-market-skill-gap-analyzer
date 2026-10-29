import { useCallback, useEffect, useState } from 'react'
import { readStorage, writeStorage } from '../lib/storage'

export type Theme = 'light' | 'dark'
const STORAGE_KEY = 'skill-gap:theme'
/** What a visitor sees until they pick a theme, whatever their OS setting. */
const DEFAULT_THEME: Theme = 'dark'

function storedTheme(): Theme | null {
  const value = readStorage(STORAGE_KEY)
  return value === 'light' || value === 'dark' ? value : null
}

/**
 * Dark until the user picks a theme explicitly; the explicit choice is stored and applied as
 * <html data-theme>, which the CSS tokens honour.
 */
export function useTheme() {
  const [preference, setPreference] = useState<Theme | null>(storedTheme)

  useEffect(() => {
    const root = document.documentElement
    if (preference) root.dataset.theme = preference
    else delete root.dataset.theme
    writeStorage(STORAGE_KEY, preference)
    // The phone's browser bar takes the header's color, which the CSS tokens set per theme.
    const header = getComputedStyle(root).getPropertyValue('--header').trim()
    if (header) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', header)
  }, [preference])

  const theme = preference ?? DEFAULT_THEME
  const toggleTheme = useCallback(() => setPreference(theme === 'dark' ? 'light' : 'dark'), [theme])

  return { theme, toggleTheme }
}
