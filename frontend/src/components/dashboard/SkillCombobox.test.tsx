import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SkillStat } from '../../api/schemas'
import { SkillCombobox } from './SkillCombobox'

const skills = [
  { slug: 'sql', name: 'SQL', category: 'linguagens', count: 160, share: 0.5 },
  { slug: 'statistics', name: 'Estatística', category: 'dados_bi', count: 40, share: 0.1 },
  { slug: 'python', name: 'Python', category: 'linguagens', count: 130, share: 0.4 },
] as SkillStat[]

function setup(exclude: string[] = []) {
  const onSelect = vi.fn<(slug: string) => void>()
  render(
    <SkillCombobox
      label="Suas competências"
      skills={skills}
      exclude={exclude}
      onSelect={onSelect}
    />,
  )
  return { onSelect, input: screen.getByRole('combobox', { name: 'Suas competências' }) }
}

describe('SkillCombobox', () => {
  it('filters as you type, ignoring accents and case', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'estatis' } })
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'EstatísticaDados & BI40 vagas',
    ])
  })

  it('picks with the keyboard and clears the text', () => {
    const { input, onSelect } = setup()
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1]?.id)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('statistics')
    expect(input).toHaveValue('')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('picks with the mouse and hides skills already in the profile', () => {
    const { input, onSelect } = setup(['sql'])
    fireEvent.focus(input)
    expect(screen.queryByRole('option', { name: /SQL/ })).not.toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('option', { name: /Python/ }))
    expect(onSelect).toHaveBeenCalledWith('python')
  })

  it('says when nothing matches', () => {
    const { input } = setup()
    fireEvent.change(input, { target: { value: 'cobol' } })
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Nenhuma competência encontrada com “cobol”.')).toBeInTheDocument()
  })
})
