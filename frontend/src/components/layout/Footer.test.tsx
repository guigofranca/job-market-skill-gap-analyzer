import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Footer } from './Header'

describe('Footer', () => {
  it('links to the author, the code and the issues for feedback or data removal', () => {
    render(<Footer />)
    expect(screen.getByRole('link', { name: 'guilhermefranca' })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/guilhermefranca0/',
    )
    expect(screen.getByRole('link', { name: 'código aberto no GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/guigofranca/job-market-skill-gap-analyzer',
    )
    const issues = screen.getByRole('link', { name: 'abra uma issue no GitHub' })
    expect(issues).toHaveAttribute(
      'href',
      'https://github.com/guigofranca/job-market-skill-gap-analyzer/issues/new',
    )
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener noreferrer'))
    }
  })
})
