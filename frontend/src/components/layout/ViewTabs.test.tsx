import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { parseView, viewToSearch, type View } from '../../hooks/useView'
import { ViewTabs } from './ViewTabs'

describe('view in the URL', () => {
  it('defaults to "vagas" and ignores unknown values', () => {
    expect(parseView('')).toBe('vagas')
    expect(parseView('?aba=mercado')).toBe('mercado')
    expect(parseView('?aba=candidaturas')).toBe('candidaturas')
    expect(parseView('?aba=<script>')).toBe('vagas')
  })

  it('keeps other params and leaves the default view out of the URL', () => {
    expect(viewToSearch('mercado', '?level=junior')).toBe('?level=junior&aba=mercado')
    expect(viewToSearch('vagas', '?level=junior&aba=mercado')).toBe('?level=junior')
  })
})

describe('ViewTabs', () => {
  it('exposes WAI-ARIA tabs with a single tab stop', () => {
    render(<ViewTabs view="vagas" onChange={() => {}} />)
    const [vagas, , mercado] = screen.getAllByRole('tab')
    expect(vagas).toHaveAttribute('aria-selected', 'true')
    expect(vagas).toHaveAttribute('tabindex', '0')
    expect(mercado).toHaveAttribute('aria-selected', 'false')
    expect(mercado).toHaveAttribute('tabindex', '-1')
  })

  it('switches with a click or with the arrow keys', () => {
    const onChange = vi.fn<(view: View) => void>()
    render(<ViewTabs view="vagas" onChange={onChange} />)

    fireEvent.click(screen.getByRole('tab', { name: 'Mercado' }))
    expect(onChange).toHaveBeenLastCalledWith('mercado')

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Vagas' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('candidaturas')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Vagas' }), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith('mercado')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Vagas' }), { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith('mercado')
  })
})
