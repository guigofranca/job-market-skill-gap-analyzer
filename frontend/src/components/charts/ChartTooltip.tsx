import type { ReactNode } from 'react'

/** Tooltip shell: value first (strong), label second; series keyed by a short line, not a box. */
export function TooltipBox({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="border-line bg-surface min-w-40 rounded-lg border px-3 py-2 text-sm shadow-lg">
      <p className="text-muted mb-1 text-xs">{title}</p>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

export function TooltipRow({
  color,
  value,
  label,
  detail,
}: {
  color?: string
  value: ReactNode
  label: ReactNode
  detail?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      {color && (
        <span aria-hidden className="h-0.5 w-3 shrink-0 rounded" style={{ background: color }} />
      )}
      <span className="text-ink font-semibold tabular-nums">{value}</span>
      <span className="text-ink-2">{label}</span>
      {detail && <span className="text-muted ml-auto pl-2 text-xs">{detail}</span>}
    </div>
  )
}

/** Legend entries: the colored mark carries identity, the text stays in ink. */
export function Legend({
  items,
  shape = 'line',
}: {
  items: readonly { key: string; label: string; color: string }[]
  shape?: 'line' | 'rect'
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legenda">
      {items.map((item) => (
        <li key={item.key} className="text-ink-2 flex items-center gap-1.5 text-xs">
          <span
            aria-hidden
            className={shape === 'line' ? 'h-0.5 w-4 rounded' : 'size-2.5 rounded-sm'}
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
