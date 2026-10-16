import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Workplaces } from '../../api/schemas'
import { WorkplaceChart } from './WorkplaceChart'

const data: Workplaces = {
  items: [
    {
      area: null,
      label: 'Todas as áreas',
      total: 10,
      unknown: 2,
      workplaces: [
        { key: 'remoto', label: 'Remoto', count: 4, share: 0.5 },
        { key: 'hibrido', label: 'Híbrido', count: 3, share: 0.375 },
        { key: 'presencial', label: 'Presencial', count: 1, share: 0.125 },
      ],
    },
    {
      area: 'dados',
      label: 'Dados',
      total: 1,
      unknown: 0,
      workplaces: [
        { key: 'remoto', label: 'Remoto', count: 0, share: 0 },
        { key: 'hibrido', label: 'Híbrido', count: 0, share: 0 },
        { key: 'presencial', label: 'Presencial', count: 1, share: 1 },
      ],
    },
  ],
}

describe('WorkplaceChart', () => {
  it('labels each wide enough segment and counts the jobs of each row', () => {
    render(<WorkplaceChart data={data} />)
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('38%')).toBeInTheDocument()
    expect(screen.getByText('13%')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText('10 vagas')).toBeInTheDocument()
    expect(screen.getByText('1 vaga')).toBeInTheDocument()
  })

  it('shows the counts behind the shares on hover', () => {
    render(<WorkplaceChart data={data} />)
    fireEvent.mouseEnter(screen.getByText('Todas as áreas').parentElement!)
    expect(screen.getByText('4 de 8')).toBeInTheDocument()
    expect(screen.getByText('2 sem modalidade informada')).toBeInTheDocument()
  })
})
