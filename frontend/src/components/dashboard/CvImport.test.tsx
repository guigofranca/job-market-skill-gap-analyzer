import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Meta, SkillPatterns } from '../../api/schemas'
import { useSkillPatterns } from '../../hooks/useDashboardData'
import type { KnownSkills } from '../../hooks/useKnownSkills'
import { CvFileError, readCvFile } from '../../lib/cvFile'
import { CvImport } from './CvImport'

vi.mock('../../hooks/useDashboardData', () => ({
  useSkillPatterns: vi.fn<typeof useSkillPatterns>(),
}))
vi.mock('../../lib/cvFile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/cvFile')>()),
  readCvFile: vi.fn<typeof readCvFile>(),
}))

const patterns: SkillPatterns = {
  items: [
    { slug: 'python', pattern: /\bpython\b/.source, ignore_case: true },
    { slug: 'sql', pattern: /\bsql\b/.source, ignore_case: true },
    { slug: 'excel', pattern: /\bexcel\b/.source, ignore_case: true },
  ],
}
const meta = {
  skills: [
    { slug: 'python', name: 'Python' },
    { slug: 'sql', name: 'SQL' },
    { slug: 'excel', name: 'Excel' },
  ],
} as unknown as Meta

function setup() {
  const add = vi.fn<(slug: string) => void>()
  render(<CvImport meta={meta} profile={{ add } as unknown as KnownSkills} known={['sql']} />)
  fireEvent.click(screen.getByRole('button', { name: 'Preencher com meu currículo' }))
  return { add }
}

beforeEach(() => {
  vi.mocked(useSkillPatterns).mockReturnValue({
    data: patterns,
    isPending: false,
    isError: false,
  } as ReturnType<typeof useSkillPatterns>)
})

describe('CvImport', () => {
  it('reads a PDF in the browser and adds the skills the visitor confirms', async () => {
    vi.mocked(readCvFile).mockResolvedValue('Projetos em Python, SQL e Excel.')
    const { add } = setup()

    const pdf = new File(['%PDF-1.7'], 'curriculo.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Escolher PDF'), {
      target: { files: [pdf] },
    })

    const legend = await screen.findByText(/Encontramos 2 competências novas em curriculo.pdf/)
    expect(legend).toHaveTextContent('e 1 que você já tinha marcado')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Excel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao perfil (1)' }))
    expect(add.mock.calls).toEqual([['python']])
  })

  it('explains files it cannot read', async () => {
    vi.mocked(readCvFile).mockRejectedValue(new CvFileError('Este PDF tem senha.'))
    setup()
    fireEvent.change(screen.getByLabelText('Escolher PDF'), {
      target: { files: [new File(['%PDF'], 'cv.pdf')] },
    })
    await waitFor(() => expect(screen.getByText('Este PDF tem senha.')).toBeInTheDocument())
  })
})
