import { AlertTriangle, Inbox, RotateCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { ApiError } from '../../api/client'

export function LoadingState({
  height = 240,
  label = 'Carregando…',
}: {
  height?: number
  label?: string
}) {
  return (
    <output
      aria-live="polite"
      className="bg-surface-2 flex animate-pulse items-center justify-center rounded-lg"
      style={{ height }}
    >
      <span className="text-muted text-sm">{label}</span>
    </output>
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return 'Algo deu errado ao carregar esta seção.'
}

export function ErrorState({
  error,
  onRetry,
  compact = false,
}: {
  error: unknown
  onRetry?: () => void
  compact?: boolean
}) {
  const requestId = error instanceof ApiError ? error.requestId : undefined
  return (
    <div
      role="alert"
      className={`border-line bg-surface-2 flex flex-col items-center justify-center gap-3 rounded-lg border text-center ${compact ? 'p-4' : 'min-h-48 p-6'}`}
    >
      <AlertTriangle aria-hidden className="text-danger size-5" />
      <p className="text-ink-2 max-w-md text-sm">{errorMessage(error)}</p>
      {requestId && <p className="text-muted text-xs">Código da requisição: {requestId}</p>}
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          <RotateCw aria-hidden className="size-4" />
          Tentar novamente
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border-line flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center">
      <Inbox aria-hidden className="text-muted size-5" />
      <p className="text-ink text-sm font-medium">{title}</p>
      {children && <div className="text-muted max-w-md text-sm">{children}</div>}
    </div>
  )
}
