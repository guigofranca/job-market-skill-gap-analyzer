import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job, Jobs, Match, Matches, Meta } from '../../api/schemas'
import { useJobs, useMatches } from '../../hooks/useDashboardData'
import { ViewedContext, useViewedState } from '../../hooks/useViewed'
import type { SeenFilter } from '../../lib/viewed'
import { JobList } from './JobList'

vi.mock('../../hooks/useDashboardData', () => ({
  useJobs: vi.fn<typeof useJobs>(),
  useMatches: vi.fn<typeof useMatches>(),
}))
const mockedUseJobs = vi.mocked(useJobs)
const mockedUseMatches = vi.mocked(useMatches)

const meta = {
  skills: [
    { slug: 'python', name: 'Python' },
    { slug: 'sql', name: 'SQL' },
    { slug: 'power-bi', name: 'Power BI', share: 0.3 },
  ],
} as unknown as Meta

const job: Job = {
  id: '0123456789abcdef',
  source: 'gupy',
  title: 'Estágio em Dados',
  company: 'ACME',
  location: 'Recife, PE',
  url: 'https://acme.gupy.io/job/1',
  published_at: '2026-10-01',
  level: 'estagio',
  area: 'dados',
  city: 'Recife',
  state: 'PE',
  workplace: 'hibrido',
  contracts: ['estagio'],
  affirmative: [],
  accepts_pcd: false,
  salary_min: null,
  salary_max: null,
  deadline: null,
  first_seen: '2026-10-10T12:00:00+00:00',
  requirements: {
    courses: [],
    courses_open: false,
    degree_required: false,
    min_semester: null,
    max_semester: null,
    graduation_from: null,
    graduation_to: null,
    english: null,
    english_level: null,
    weekly_hours: null,
  },
  conflicts: [],
  skills: ['python', 'power-bi'],
  nice_to_have: [],
  benefits: ['vale_refeicao', 'plano_saude'],
}

function loaded<T>(data: T) {
  return {
    data,
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    error: null,
    refetch: vi.fn<() => Promise<unknown>>(),
  }
}

function matches(data: Partial<Matches>) {
  const full: Matches = {
    total_jobs: 10,
    ready: 1,
    one_away: 2,
    total: 1,
    ineligible: 0,
    limit: 10,
    offset: 0,
    items: [],
    ...data,
  }
  return loaded(full) as unknown as ReturnType<typeof useMatches>
}

function WithViewed({ children }: { children: ReactNode }) {
  return <ViewedContext value={useViewedState()}>{children}</ViewedContext>
}

afterEach(() => localStorage.clear())
beforeEach(() => {
  mockedUseJobs.mockReset()
  mockedUseMatches.mockReset()
  const jobs: Jobs = { total: 1, ineligible: 0, limit: 10, offset: 0, items: [job] }
  mockedUseJobs.mockReturnValue(loaded(jobs) as unknown as ReturnType<typeof useJobs>)
  mockedUseMatches.mockReturnValue({ isPending: true } as ReturnType<typeof useMatches>)
})

describe('JobList', () => {
  it('lists the newest jobs when there is no skills profile yet', () => {
    render(<JobList filters={{ area: 'dados' }} meta={meta} known={[]} />)

    expect(screen.getByRole('heading', { name: 'Vagas mais recentes' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Prontas para aplicar/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Estágio em Dados/ })).toBeInTheDocument()
    expect(screen.queryByText(/de compatibilidade/)).not.toBeInTheDocument()
    // Benefits are tags derived from the posting, never its text.
    expect(screen.getByRole('list', { name: 'Benefícios citados no anúncio' })).toHaveTextContent(
      'Vale-refeição/alimentaçãoPlano de saúde',
    )
    expect(mockedUseJobs).toHaveBeenLastCalledWith(
      { area: 'dados' },
      { limit: 10, offset: 0 },
      true,
    )
  })

  it('ranks the same list by the profile: coverage, what you have and what is missing', () => {
    const match: Match = {
      ...job,
      matched: ['python'],
      missing: ['power-bi'],
      coverage: 0.5,
      nice_to_have: ['sql'],
    }
    mockedUseMatches.mockReturnValue(matches({ items: [match] }))
    render(<JobList filters={{ level: 'estagio' }} meta={meta} known={['python', 'sql']} />)

    expect(screen.getByRole('heading', { name: 'Vagas que combinam com você' })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Vagas ordenadas por compatibilidade' })
    const [row] = within(list).getAllByRole('listitem')
    if (!row) throw new Error('no job rendered')
    expect(row).toHaveTextContent('50%')
    expect(row).toHaveTextContent('você tem 1 de 2')
    expect(within(row).getByText('Python')).toHaveTextContent('Python(você tem)')
    const asked = within(row).getByRole('list', { name: 'Competências pedidas na vaga' })
    expect(within(asked).getByText('Power BI').parentElement).toHaveTextContent('FaltaPower BI')
    // One line says what closes the gap, with free places to learn it.
    expect(row).toHaveTextContent('Falta só Power BI, pedida em 30% das vagas.')
    expect(
      within(row)
        .getByRole('link', { name: /Microsoft Learn/ })
        .getAttribute('href'),
    ).toContain('learn.microsoft.com/pt-br/training/powerplatform/power-bi')
    expect(within(row).queryByRole('link', { name: /YouTube/ })).not.toBeInTheDocument()
    // A diferencial is listed apart, ticked when the visitor has it, and never "Falta".
    const plus = within(row).getByRole('list', { name: 'Diferenciais (não obrigatórios)' })
    expect(plus).toHaveTextContent('SQL(diferencial que você tem)')
    expect(screen.getByRole('button', { name: /Prontas para aplicar \(1\)/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(mockedUseMatches).toHaveBeenLastCalledWith({ level: 'estagio' }, ['python', 'sql'], {
      limit: 10,
      offset: 0,
      missing: 0,
    })
    // The plain list is not fetched while ranking.
    expect(mockedUseJobs).toHaveBeenLastCalledWith(
      { level: 'estagio' },
      { limit: 10, offset: 0 },
      false,
    )
  })

  it('says which missing skill to learn first, and nothing when none is missing', () => {
    const ready: Match = {
      ...job,
      id: 'aaaaaaaaaaaaaaaa',
      matched: ['python'],
      missing: [],
      coverage: 1,
    }
    const far: Match = {
      ...job,
      id: 'bbbbbbbbbbbbbbbb',
      matched: [],
      missing: ['power-bi', 'sql'],
      coverage: 0,
    }
    mockedUseMatches.mockReturnValue(matches({ items: [ready, far] }))
    render(<JobList filters={{}} meta={meta} known={['python']} />)

    const list = screen.getByRole('list', { name: 'Vagas ordenadas por compatibilidade' })
    const rows = within(list)
      .getAllByRole('listitem')
      .filter((item) => item.parentElement === list)
    expect(rows[0]).not.toHaveTextContent(/Falta|comece por/)
    expect(rows[1]).toHaveTextContent(
      'Faltam 2: comece por Power BI, a mais pedida delas (30% das vagas).',
    )
    // 1 of 1 reads as a perfect match: say the posting lists little.
    expect(rows[0]).toHaveTextContent('poucos requisitos no anúncio')
    expect(rows[1]).not.toHaveTextContent('poucos requisitos no anúncio')
  })

  it('offers the "missing one skill" tab when nothing is fully covered yet', () => {
    mockedUseMatches.mockReturnValue(matches({ ready: 0, one_away: 3, total: 0, items: [] }))
    render(<JobList filters={{}} meta={meta} known={['sql']} />)

    expect(screen.getByText(/Nenhuma vaga 100% compatível/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Ver as que faltam 1 competência \(3\)/ }))
    expect(mockedUseMatches).toHaveBeenLastCalledWith({}, ['sql'], {
      limit: 10,
      offset: 0,
      missing: 1,
    })
  })

  it('searches by title in the ranked list too', async () => {
    mockedUseMatches.mockReturnValue(matches({ items: [] }))
    render(<JobList filters={{}} meta={meta} known={['python']} />)

    fireEvent.click(screen.getByRole('button', { name: /Todas/ }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar vagas por título' }), {
      target: { value: 'dados' },
    })
    await waitFor(() =>
      expect(mockedUseMatches).toHaveBeenLastCalledWith({}, ['python'], {
        limit: 10,
        offset: 0,
        q: 'dados',
      }),
    )
  })

  it('tags jobs that are new to the visitor and can list only them', () => {
    const lastVisit = '2026-10-05T00:00:00.000Z'
    const fresh = { ...job, published_at: '2026-10-09' }
    // Collected before the visit: already seen.
    const seen = {
      ...job,
      id: 'fedcba9876543210',
      title: 'Estágio em BI',
      first_seen: '2026-10-01T09:00:00+00:00',
    }
    // Collected only now, but published a month ago (e.g. a new search term): not news.
    const reposted = {
      ...job,
      id: 'aaaaaaaaaaaaaaaa',
      title: 'Estágio em ETL',
      published_at: '2026-09-01',
    }
    const jobs: Jobs = {
      total: 3,
      ineligible: 0,
      limit: 10,
      offset: 0,
      items: [fresh, seen, reposted],
    }
    mockedUseJobs.mockReturnValue(loaded(jobs) as unknown as ReturnType<typeof useJobs>)
    render(<JobList filters={{}} meta={meta} known={[]} lastVisit={lastVisit} />)

    const rows = within(screen.getByRole('list', { name: 'Vagas mais recentes' }))
      .getAllByRole('listitem')
      .filter((item) => item.querySelector('a'))
    expect(rows.map((row) => within(row).queryByText('Nova para você') !== null)).toEqual([
      true,
      false,
      false,
    ])
    // The count of new jobs in this scope is a one-row request.
    expect(mockedUseJobs).toHaveBeenCalledWith({}, { limit: 1, offset: 0, since: lastVisit }, true)

    const toggle = screen.getByRole('button', {
      name: /3 vagas novas para você desde sua última visita/,
    })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(mockedUseJobs).toHaveBeenLastCalledWith(
      {},
      { limit: 10, offset: 0, since: lastVisit },
      true,
    )
  })

  it('has no "new" toggle on a first visit', () => {
    render(<JobList filters={{}} meta={meta} known={[]} />)
    expect(
      screen.queryByRole('button', { name: /desde sua última visita/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Nova para você')).not.toBeInTheDocument()
  })

  it('marks opened postings, and hides them or lists only them with the "Vistas" filter', () => {
    const { rerender } = render(
      <WithViewed>
        <JobList filters={{}} meta={meta} known={[]} />
      </WithViewed>,
    )
    fireEvent.click(screen.getByRole('link', { name: /Estágio em Dados/ }))
    expect(screen.getByText('vista agora')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('skill-gap:viewed') ?? '{}')).toHaveProperty(job.id)

    const list = (seen: SeenFilter) => (
      <WithViewed>
        <JobList filters={{}} meta={meta} known={[]} seen={seen} />
      </WithViewed>
    )
    rerender(list({ mode: 'hide', ids: [job.id] }))
    expect(mockedUseJobs).toHaveBeenLastCalledWith(
      {},
      { limit: 10, offset: 0, exclude: [job.id] },
      true,
    )
    rerender(list({ mode: 'only', ids: [job.id] }))
    expect(mockedUseJobs).toHaveBeenLastCalledWith(
      {},
      { limit: 10, offset: 0, ids: [job.id] },
      true,
    )

    // Nothing opened yet: an empty list, not every job (no ids = no filter for the API).
    rerender(list({ mode: 'only', ids: [] }))
    expect(screen.getByText('Nenhuma vaga vista ainda')).toBeInTheDocument()
    expect(mockedUseJobs).toHaveBeenLastCalledWith({}, { limit: 10, offset: 0, ids: [] }, false)
  })
})
