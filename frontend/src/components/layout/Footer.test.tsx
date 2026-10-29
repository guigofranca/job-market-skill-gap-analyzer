import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Footer } from './Header'

describe('Footer', () => {
  it('credits the author as text and links to the issues for feedback or data removal', () => {
    render(<Footer />)
    expect(screen.getByText('guilhermefranca')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'guilhermefranca' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'abra uma issue no GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/guigofranca/job-market-skill-gap-analyzer/issues/new',
    )
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener noreferrer'))
    }
  })
})
