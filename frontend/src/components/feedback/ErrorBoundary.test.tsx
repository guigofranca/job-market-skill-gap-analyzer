import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'
import { SectionFallback } from './Fallbacks'

let shouldThrow = true

function Flaky() {
  if (shouldThrow) throw new Error('boom')
  return <p>conteúdo ok</p>
}

describe('ErrorBoundary', () => {
  it('renders the fallback and recovers after a retry', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    shouldThrow = true
    render(
      <ErrorBoundary fallback={(_, reset) => <SectionFallback title="Gráfico" reset={reset} />}>
        <Flaky />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Gráfico')

    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }))
    expect(screen.getByText('conteúdo ok')).toBeInTheDocument()
  })

  it('resets automatically when reset keys change', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    shouldThrow = true
    const fallback = () => <p>falhou</p>
    const { rerender } = render(
      <ErrorBoundary fallback={fallback} resetKeys={['a']}>
        <Flaky />
      </ErrorBoundary>,
    )
    expect(screen.getByText('falhou')).toBeInTheDocument()

    shouldThrow = false
    rerender(
      <ErrorBoundary fallback={fallback} resetKeys={['b']}>
        <Flaky />
      </ErrorBoundary>,
    )
    expect(screen.getByText('conteúdo ok')).toBeInTheDocument()
  })
})
