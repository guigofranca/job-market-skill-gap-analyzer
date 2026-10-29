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
    expect(screen.getByText('10 vagas')).toBeInTheDocument()
    expect(screen.getByText('1 vaga')).toBeInTheDocument()
  })

  it('leaves the shares of a row with few jobs out of the bar, and says why', () => {
    render(<WorkplaceChart data={data} />)
    // Dados has a single job: "100% presencial" would read as a finding.
    expect(screen.queryByText('100%')).not.toBeInTheDocument()
    expect(screen.getByText(/menos de 10 vagas/)).toBeInTheDocument()
  })

  it('has no caption when every row has enough jobs', () => {
    render(<WorkplaceChart data={{ items: data.items.slice(0, 1) }} />)
    expect(screen.queryByText(/menos de 10 vagas/)).not.toBeInTheDocument()
  })

  it('shows the counts behind the shares on hover', () => {
    render(<WorkplaceChart data={data} />)
    fireEvent.mouseEnter(screen.getByText('Todas as áreas').parentElement!)
    expect(screen.getByText('4 de 8')).toBeInTheDocument()
    expect(screen.getByText('2 sem modalidade informada')).toBeInTheDocument()
  })
})
