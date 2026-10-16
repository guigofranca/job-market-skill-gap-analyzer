import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Gap, Meta } from '../../api/schemas'
import { useGap, useJobs, useMatches, useSkillPatterns } from '../../hooks/useDashboardData'
import type { KnownSkills } from '../../hooks/useKnownSkills'
import { ForYouSection } from './ForYouSection'

vi.mock('../../hooks/useDashboardData', () => ({
  useGap: vi.fn<typeof useGap>(),
  useJobs: vi.fn<typeof useJobs>(),
  useMatches: vi.fn<typeof useMatches>(),
  useSkillPatterns: vi.fn<typeof useSkillPatterns>(),
}))
const mockedUseGap = vi.mocked(useGap)
const mockedUseMatches = vi.mocked(useMatches)
const mockedUseJobs = vi.mocked(useJobs)

const meta = {
  skills: [
    { slug: 'sql', name: 'SQL', category: 'linguagens', count: 160, share: 0.5 },
    { slug: 'python', name: 'Python', category: 'linguagens', count: 130, share: 0.4 },
    { slug: 'excel', name: 'Excel', category: 'dados_bi', count: 70, share: 0.2 },
  ],
} as unknown as Meta

function profile(known: string[]): KnownSkills {
  return {
    known,
    add: vi.fn<(slug: string) => void>(),
    remove: vi.fn<(slug: string) => void>(),
    clear: vi.fn<() => void>(),
    max: 40,
  }
}

const gap: Gap = {
  total_jobs: 100,
  known: [],
  avg_coverage: 0.42,
  fully_covered: 3,
  half_covered: 40,
  recommendations: [
    { slug: 'python', name: 'Python', category: 'linguagens', count: 40, share: 0.4, unlocks: 5 },
  ],
}

beforeEach(() => {
  mockedUseGap.mockReset()
  vi.mocked(useSkillPatterns).mockReturnValue({
    isPending: true,
  } as ReturnType<typeof useSkillPatterns>)
  mockedUseMatches.mockReset()
  mockedUseMatches.mockReturnValue({ isPending: true } as ReturnType<typeof useMatches>)
  mockedUseJobs.mockReset()
  mockedUseJobs.mockReturnValue({ isPending: true } as ReturnType<typeof useJobs>)
  mockedUseGap.mockReturnValue({
    data: gap,
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
  } as unknown as ReturnType<typeof useGap>)
})

describe('ForYouSection', () => {
  it('starts with the newest jobs, one-click suggestions and a hint about the learning panel', () => {
    const empty = profile([])
    render(<ForYouSection filters={{}} meta={meta} profile={empty} known={[]} />)

    expect(screen.getByRole('heading', { name: 'Vagas mais recentes' })).toBeInTheDocument()
    expect(
      screen.getByText(/Aqui aparecem as que mais aproximam você das vagas/),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar SQL' }))
    expect(empty.add).toHaveBeenCalledWith('sql')
  })

  it('shows matching jobs and what to learn next side by side once skills are set', () => {
    const current = profile(['sql'])
    render(<ForYouSection filters={{}} meta={meta} profile={current} known={['sql']} />)

    expect(screen.getByRole('heading', { name: 'Vagas que combinam com você' })).toBeInTheDocument()
    const learn = screen
      .getByRole('heading', { name: /O que aprender a seguir/ })
      .closest('section')
    if (!learn) throw new Error('missing panel')
    expect(learn).not.toHaveTextContent('Cobertura média')
    expect(learn).toHaveTextContent('40%')
    expect(learn).toHaveTextContent('Aprendendo, você se aproxima de +5 vagas')
    expect(within(learn).getByRole('link', { name: /Tutorial oficial/ })).toHaveAttribute(
      'href',
      'https://docs.python.org/pt-br/3/tutorial/',
    )

    fireEvent.click(within(learn).getByRole('button', { name: /Já sei Python/ }))
    expect(current.add).toHaveBeenCalledWith('python')

    fireEvent.click(screen.getByRole('button', { name: 'Remover SQL' }))
    expect(current.remove).toHaveBeenCalledWith('sql')
    // The skill already in the profile is not suggested again.
    expect(screen.queryByRole('button', { name: 'Adicionar SQL' })).not.toBeInTheDocument()
  })
})
