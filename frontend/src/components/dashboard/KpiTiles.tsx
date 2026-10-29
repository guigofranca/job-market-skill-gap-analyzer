import type { UseQueryResult } from '@tanstack/react-query'
import type { Summary } from '../../api/schemas'
import { formatNumber, formatPercent } from '../../lib/format'
import { ErrorState } from '../feedback/States'

interface KpiTilesProps {
  query: UseQueryResult<Summary>
  totalJobs: number
  selectedSkillName: string | undefined
}

/** Two columns on phones (the last tile takes a full row), three side by side from lg. */
const GRID = 'grid grid-cols-2 gap-3 lg:grid-cols-3'
const LAST = 'col-span-2 lg:col-span-1'

/** Stat tiles: label, value (proportional figures), one line of context. */
export function KpiTiles({ query, totalJobs, selectedSkillName }: KpiTilesProps) {
  if (query.isPending) {
    return (
      <output className={GRID} aria-label="Carregando indicadores">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className={`card bg-surface-2 h-28 animate-pulse ${index === 2 ? LAST : ''}`}
          />
        ))}
      </output>
    )
  }
  if (query.isError && !query.data) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} compact />
  }

  const summary = query.data
  const levelCount = (key: string) =>
    summary.by_level.find((level) => level.key === key)?.count ?? 0
  const dimmed = query.isFetching && query.isPlaceholderData

  return (
    <div
      className={`${GRID} transition-opacity ${dimmed ? 'opacity-50' : ''}`}
      aria-busy={query.isFetching}
    >
      <Tile
        label="Vagas encontradas"
        value={formatNumber(summary.total_jobs)}
        hint={`de ${formatNumber(totalJobs)} vagas analisadas`}
      />
      <Tile
        label={
          selectedSkillName
            ? `Mais pedida junto com ${selectedSkillName}`
            : 'Competência mais pedida'
        }
        value={summary.top_skill?.name ?? '—'}
        hint={
          summary.top_skill ? `em ${formatPercent(summary.top_skill.share)} das vagas` : 'sem dados'
        }
      />
      <Tile
        label="Estágio · Júnior"
        value={`${formatNumber(levelCount('estagio'))} · ${formatNumber(levelCount('junior'))}`}
        hint="vagas encontradas por nível"
        className={LAST}
      />
    </div>
  )
}

function Tile({
  label,
  value,
  hint,
  className = '',
}: {
  label: string
  value: string
  hint: string
  className?: string
}) {
  return (
    <div className={`card flex min-w-0 flex-col gap-1 p-4 ${className}`}>
      <span className="text-muted truncate text-xs font-medium sm:text-sm" title={label}>
        {label}
      </span>
      <span
        className="text-ink line-clamp-2 text-xl leading-tight font-semibold break-words sm:text-3xl"
        title={value}
      >
        {value}
      </span>
      <span className="text-muted truncate text-xs" title={hint}>
        {hint}
      </span>
    </div>
  )
}
