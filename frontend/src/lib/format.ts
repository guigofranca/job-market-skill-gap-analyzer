const integer = new Intl.NumberFormat('pt-BR')
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const percent0 = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 })
const percent1 = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })
const longDate = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })

export const formatNumber = (value: number) => integer.format(value)
export const formatDecimal = (value: number) => decimal.format(value)

/** Small shares keep one decimal (3,5%) so they don't all collapse to "4%". */
export const formatPercent = (value: number) =>
  (value > 0 && value < 0.1 ? percent1 : percent0).format(value)

/** 'YYYY-MM-DD' parsed as a local calendar date (no timezone shift). */
function parseIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const [, year, month, day] = match
  return new Date(Number(year), Number(month) - 1, Number(day))
}

export function formatDate(iso: string | null): string {
  const date = iso ? parseIsoDate(iso) : null
  return date ? longDate.format(date) : '—'
}

/** '2026-10-24' -> '24/10' (chart axes). */
export function formatDayMonth(iso: string): string {
  const date = parseIsoDate(iso)
  return date ? dayMonth.format(date) : iso
}

/** A change of share in percentage points: +3,2 p.p. */
export function formatPoints(change: number): string {
  const points = decimal.format(Math.abs(change) * 100)
  return `${change > 0 ? '+' : change < 0 ? '−' : ''}${points} p.p.`
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : dateTime.format(date)
}

const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

/** "agora há pouco", "há 3 horas", "ontem", "há 5 dias". */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return iso
  const minutes = Math.round((now.getTime() - time) / 60_000)
  if (minutes < 5) return 'agora há pouco'
  if (minutes < 60) return relative.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return relative.format(-hours, 'hour')
  return relative.format(-Math.round(hours / 24), 'day')
}

/** Data older than this is flagged: deadlines pass and postings close within days. */
export const STALE_DATA_DAYS = 3

export function isStale(iso: string, now: Date = new Date()): boolean {
  return now.getTime() - Date.parse(iso) > STALE_DATA_DAYS * 86_400_000
}

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

/** "R$ 1.837", "R$ 1.200 – R$ 1.590", "a partir de R$ 2.000", "até R$ 3.000"; null if unknown. */
export function formatSalary(min: number | null, max: number | null): string | null {
  if (min && max) {
    return min === max ? currency.format(min) : `${currency.format(min)} – ${currency.format(max)}`
  }
  if (min) return `a partir de ${currency.format(min)}`
  if (max) return `até ${currency.format(max)}`
  return null
}

/** Whole days from `today` until the ISO date (negative when past). */
export function daysUntil(iso: string, today: Date = new Date()): number | null {
  const date = parseIsoDate(iso)
  if (!date) return null
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((date.getTime() - start.getTime()) / 86_400_000)
}

/** Application deadline, phrased by urgency: "Encerra hoje" … "Inscrições até 20/10". */
export function formatDeadline(
  iso: string,
  today: Date = new Date(),
): { label: string; soon: boolean } | null {
  const days = daysUntil(iso, today)
  const date = parseIsoDate(iso)
  if (days === null || !date || days < 0) return null
  if (days === 0) return { label: 'Encerra hoje', soon: true }
  if (days === 1) return { label: 'Encerra amanhã', soon: true }
  if (days <= 3) return { label: `Encerra em ${days} dias`, soon: true }
  return { label: `Inscrições até ${dayMonth.format(date)}`, soon: false }
}
