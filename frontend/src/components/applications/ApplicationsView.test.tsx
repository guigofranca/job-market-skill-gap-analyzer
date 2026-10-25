import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from '../../api/schemas'
import { ApplicationsContext, useApplicationsState } from '../../hooks/useApplications'
import { useJobsByIds } from '../../hooks/useDashboardData'
import { exportApplications } from '../../lib/applicationsFile'
import type { Application } from '../../lib/applications'
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

  it('restores a backup file and offers the deadlines as a calendar', async () => {
    render(<Harness />)
    const backup: Application = {
      job: { ...job, source: 'gupy', deadline: '2099-12-31' } as Application['job'],
      status: 'processo',
      note: 'Segunda fase',
      savedAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-02T12:00:00.000Z',
    }
    const file = new File([exportApplications([backup])], 'candidaturas.json', {
      type: 'application/json',
    })
    fireEvent.change(screen.getByLabelText('Arquivo de backup das candidaturas'), {
      target: { files: [file] },
    })

    expect(await screen.findByText(/Importado: 1 vaga\(s\) nova\(s\)/)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Em processo' })).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /Exportar backup/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prazos no calendário (1)' })).toBeInTheDocument()
  })

  it('explains why a file cannot be imported', async () => {
    render(<Harness />)
    const file = new File(['{"hello": 1}'], 'outro.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('Arquivo de backup das candidaturas'), {
      target: { files: [file] },
    })
    expect(await screen.findByText(/não é um backup exportado por este painel/)).toBeInTheDocument()
    expect(screen.getByText('Nenhuma vaga salva ainda')).toBeInTheDocument()
  })
})
