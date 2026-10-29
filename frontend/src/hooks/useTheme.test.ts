import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useTheme } from './useTheme'

describe('useTheme', () => {
  let style: HTMLStyleElement
  let meta: HTMLMetaElement

  beforeEach(() => {
    style = document.createElement('style')
    style.textContent =
      ":root { --header: #0f1a19 } :root[data-theme='light'] { --header: #eaf3f1 }"
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = '#0f1a19'
    document.head.append(style, meta)
  })

  afterEach(() => {
    style.remove()
    meta.remove()
    delete document.documentElement.dataset.theme
    localStorage.clear()
  })

  it('paints the browser bar with the header color of the chosen theme', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')

    act(() => result.current.toggleTheme())
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(meta.content).toBe('#eaf3f1')

    act(() => result.current.toggleTheme())
    expect(meta.content).toBe('#0f1a19')
  })
})
