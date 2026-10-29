import { BarChart3, Table2 } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { EmptyState, ErrorState, LoadingState } from '../feedback/States'

export interface QueryStatus {
  isPending: boolean
  isError: boolean
  error: unknown
  isFetching: boolean
  isPlaceholderData: boolean
  refetch: () => unknown
}

interface ChartCardProps {
  title: string
  subtitle?: ReactNode
  query: QueryStatus
  isEmpty: boolean
  emptyTitle?: string
  emptyHint?: ReactNode
  /** Accessible table twin of the chart (every value reachable without hover or color). */
  table?: ReactNode
  legend?: ReactNode
  /** Controls of the chart itself (e.g. which area to show), kept visible in every state. */
  toolbar?: ReactNode
  loadingHeight?: number
  /** Fill the parent's height (a flex column): the chart takes the extra room. */
  grow?: boolean
  className?: string
  children: ReactNode
}

/**
 * Frame shared by every chart: title, loading / error / empty states, a chart <-> table toggle,
 * and a dimmed "previous frame" while new data loads (no skeleton flash on refetch).
 */
export function ChartCard({
  title,
  subtitle,
  query,
  isEmpty,
  emptyTitle = 'Nenhuma vaga com esses filtros',
  emptyHint = 'Tente remover algum filtro.',
  table,
  legend,
  toolbar,
  loadingHeight = 280,
  grow = false,
  className = '',
  children,
}: ChartCardProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const headingId = useId()
  const hasData = !query.isPending && !(query.isError && isEmpty)

  let body: ReactNode
  if (query.isPending) {
    body = <LoadingState height={loadingHeight} />
  } else if (query.isError && isEmpty) {
    body = <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  } else if (isEmpty) {
    body = <EmptyState title={emptyTitle}>{emptyHint}</EmptyState>
  } else {
    body = (
      <div
        className={`transition-opacity duration-200 ${grow ? 'flex flex-1 flex-col' : ''} ${query.isFetching && query.isPlaceholderData ? 'opacity-50' : ''}`}
        aria-busy={query.isFetching}
      >
        {view === 'table' && table ? table : children}
      </div>
    )
  }

  return (
    <section
      aria-labelledby={headingId}
      className={`card flex flex-col gap-4 p-4 sm:p-5 ${grow ? 'flex-1' : ''} ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="text-ink text-base font-semibold">
            {title}
          </h2>
          {subtitle && <p className="text-muted mt-0.5 text-sm">{subtitle}</p>}
        </div>
        {table && hasData && !isEmpty && (
          <fieldset className="border-line bg-surface-2 flex rounded-lg border p-0.5">
            <legend className="sr-only">Visualização</legend>
            <ToggleButton
              active={view === 'chart'}
              onClick={() => setView('chart')}
              label="Gráfico"
            >
              <BarChart3 aria-hidden className="size-4" />
            </ToggleButton>
            <ToggleButton active={view === 'table'} onClick={() => setView('table')} label="Tabela">
              <Table2 aria-hidden className="size-4" />
            </ToggleButton>
          </fieldset>
        )}
      </header>
      {toolbar}
      {legend && hasData && !isEmpty && view === 'chart' && legend}
      {body}
      {query.isError && !isEmpty && (
        <output className="text-danger block text-xs">
          Não foi possível atualizar; exibindo os últimos dados carregados.
        </output>
      )}
    </section>
  )
}

function ToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="segment flex items-center gap-1 px-2 py-1 text-xs font-medium"
    >
      {children}
      {label}
    </button>
  )
}

/** Plain, accessible data table used as the "table view" of charts. */
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string
  columns: readonly { key: string; label: string; align?: 'left' | 'right' }[]
  rows: readonly Record<string, ReactNode>[]
}) {
  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface sticky top-0">
          <tr className="border-line border-b">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`text-muted px-2 py-2 font-medium ${column.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-line border-b last:border-0">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`text-ink-2 px-2 py-1.5 ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}
                >
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
