import { useCallback, useEffect, useState } from 'react'
import { readStorage, writeStorage } from '../lib/storage'

export type Theme = 'light' | 'dark'
const STORAGE_KEY = 'skill-gap:theme'

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function storedTheme(): Theme | null {
  const value = readStorage(STORAGE_KEY)
  return value === 'light' || value === 'dark' ? value : null
}

/**
 * Follows the OS setting until the user picks a theme explicitly; the explicit choice is stored
 * and applied as <html data-theme>, which the CSS tokens honour in both directions.
 */
export function useTheme() {
  const [preference, setPreference] = useState<Theme | null>(storedTheme)
  const [system, setSystem] = useState<Theme>(systemTheme)

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const onChange = () => setSystem(media.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (preference) root.dataset.theme = preference
    else delete root.dataset.theme
    writeStorage(STORAGE_KEY, preference)
  }, [preference])

  const theme = preference ?? system
  const toggleTheme = useCallback(() => setPreference(theme === 'dark' ? 'light' : 'dark'), [theme])

  return { theme, toggleTheme }
}
