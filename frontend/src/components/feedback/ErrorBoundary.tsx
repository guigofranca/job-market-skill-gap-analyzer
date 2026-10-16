import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Render prop for the fallback UI; receives the error and a function that retries. */
  fallback: (error: Error, reset: () => void) => ReactNode
  /** When any of these values change, a failed boundary resets automatically (e.g. filters). */
  resetKeys?: readonly unknown[]
  onReset?: () => void
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Catches render errors in its subtree so one broken widget cannot blank the whole dashboard.
 * (Async errors from data fetching are handled as query states, not thrown.)
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Hook point for an error-monitoring service (Sentry, etc.) in production.
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  override componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error && !sameKeys(previous.resetKeys, this.props.resetKeys)) {
      this.reset()
    }
  }

  reset = (): void => {
    this.props.onReset?.()
    this.setState({ error: null })
  }

  override render(): ReactNode {
    return this.state.error
      ? this.props.fallback(this.state.error, this.reset)
      : this.props.children
  }
}

function sameKeys(a: readonly unknown[] = [], b: readonly unknown[] = []): boolean {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
}
