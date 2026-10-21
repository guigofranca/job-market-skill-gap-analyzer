import type { ReactNode } from 'react'
import { ErrorBoundary } from './ErrorBoundary'
import { SectionFallback } from './Fallbacks'

/** Per-section error boundary: a crash in one widget leaves the rest of the dashboard usable. */
export function Guarded({
  title,
  resetKeys,
  className,
  children,
}: {
  title: string
  resetKeys: readonly unknown[]
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <ErrorBoundary
        resetKeys={resetKeys}
        fallback={(_, reset) => <SectionFallback title={title} reset={reset} />}
      >
        {children}
      </ErrorBoundary>
    </div>
  )
}
