import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from '../../api/schemas'
import { ApplicationsContext, useApplicationsState } from '../../hooks/useApplications'
import { useJobsByIds } from '../../hooks/useDashboardData'
import { ApplicationsView } from './ApplicationsView'
import { SaveJobButton } from './SaveJobButton'

vi.mock('../../hooks/useDashboardData', () => ({
  useJobsByIds: vi.fn<typeof useJobsByIds>(),
}))

const job = {
  id: '0123456789abcdef',
  source: 'gupy',
  title: 'Estágio em Dados',
  company: 'ACME',
  location: 'Recife, PE',
  url: 'https://acme.gupy.io/job/1',
  level: 'estagio',
  area: 'dados',
  deadline: '2099-12-31',
} as unknown as Job

function Harness() {
  const applications = useApplicationsState()
  return (
    <ApplicationsContext value={applications}>
      <SaveJobButton job={job} />
      <ApplicationsView applications={applications} onGoToJobs={() => {}} />
    </ApplicationsContext>
  )
}

beforeEach(() => {
  // The API no longer lists the job: it closed or was removed.
  vi.mocked(useJobsByIds).mockReturnValue({ jobs: [], isPending: false, isError: false })
})
afterEach(() => localStorage.clear())

describe('Minhas candidaturas', () => {
  it('saves a job, tracks its stage and note, and keeps it in this browser', () => {
    render(<Harness />)
    expect(screen.getByText('Nenhuma vaga salva ainda')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar vaga: Estágio em Dados' }))
    const saved = screen.getByRole('region', { name: 'Salvas' })
    expect(within(saved).getByRole('link', { name: /Estágio em Dados/ })).toBeInTheDocument()
    expect(within(saved).getByText('Não está mais publicada')).toBeInTheDocument()
    expect(within(saved).getByText('Inscrições até 31/12')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Etapa'), { target: { value: 'candidatei' } })
    // Once moved along, the job's button shows the stage instead of "unsave".
    expect(screen.queryByRole('button', { name: /Salva:/ })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Candidatei-me' })).toBeInTheDocument()

    const note = screen.getByLabelText('Anotação')
    fireEvent.change(note, { target: { value: 'Entrevista dia 20' } })
    fireEvent.blur(note)
    const stored = JSON.parse(localStorage.getItem('skill-gap:applications') ?? '[]') as {
      status: string
      note: string
    }[]
    expect(stored).toMatchObject([{ status: 'candidatei', note: 'Entrevista dia 20' }])

    fireEvent.click(screen.getByRole('button', { name: 'Remover Estágio em Dados da lista' }))
    expect(screen.getByText('Nenhuma vaga salva ainda')).toBeInTheDocument()
  })
})
