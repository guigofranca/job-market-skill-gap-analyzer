import type { Application } from './applications'
import { STATUS_LABELS } from './applications'
import { displayTitle } from './titles'

/*
 * Application deadlines as an iCalendar file (RFC 5545), for Google Agenda, Outlook or the
 * phone's calendar: one all-day event per deadline, with a reminder the day before.
 */

const MAX_LINE_OCTETS = 75

/** Text values escape backslash, semicolon, comma and newlines. */
function escapeText(text: string): string {
  return text.replace(/[\\;,]/g, (char) => `\\${char}`).replace(/\r?\n/g, '\\n')
}

/** Lines longer than 75 octets continue on the next line, which starts with a space. */
function fold(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let octets = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    // Continuation lines start with a space, which counts toward their 75 octets.
    const limit = parts.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1
    if (octets + size > limit) {
      parts.push(current)
      current = ''
      octets = 0
    }
    current += char
    octets += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

/** 'YYYY-MM-DD' -> 'YYYYMMDD', and the day after (all-day events end the next day). */
function dateValues(iso: string): [string, string] {
  const [year, month, day] = iso.split('-').map(Number)
  const next = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + 1))
  return [iso.replaceAll('-', ''), next.toISOString().slice(0, 10).replaceAll('-', '')]
}

function stamp(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`
}

/** Saved jobs with a deadline that the visitor is still pursuing. */
export function withDeadline(applications: readonly Application[]): Application[] {
  return applications.filter((item) => item.job.deadline && item.status !== 'encerrada')
}

export function deadlinesCalendar(applications: readonly Application[], now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Skill Gap Analyzer//Minhas candidaturas//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  for (const item of withDeadline(applications)) {
    const { job } = item
    if (!job.deadline) continue
    const [start, end] = dateValues(job.deadline)
    const title = displayTitle(job.title)
    lines.push(
      'BEGIN:VEVENT',
      `UID:${job.id}@skill-gap-analyzer`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escapeText(`Prazo: ${title}${job.company ? ` (${job.company})` : ''}`)}`,
      `DESCRIPTION:${escapeText(`Último dia de inscrição. Etapa: ${STATUS_LABELS[item.status]}.${item.note ? `\n${item.note}` : ''}`)}`,
      `URL:${job.url}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(`Amanhã encerram as inscrições: ${title}`)}`,
      'TRIGGER:-P1D',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(fold).join('\r\n')}\r\n`
}
