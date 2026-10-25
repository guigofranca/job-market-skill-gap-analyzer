import { MAX_APPLICATIONS, parseApplications, type Application } from './applications'

/*
 * "Minhas candidaturas" lives in one browser. A file moves it to another one (or backs it up):
 * exported as JSON, and imported as untrusted data, validated entry by entry.
 */

const FORMAT = 'skill-gap-applications'
export const MAX_IMPORT_BYTES = 1024 * 1024

/** A problem the visitor can act on; `message` is shown as is. */
export class ImportError extends Error {}

export function exportApplications(applications: readonly Application[], now = new Date()): string {
  return JSON.stringify(
    { format: FORMAT, version: 1, exported_at: now.toISOString(), applications },
    null,
    2,
  )
}

export function parseApplicationsFile(text: string): Application[] {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ImportError('Este arquivo não é um backup de candidaturas (JSON inválido).')
  }
  const file = raw as { format?: unknown; applications?: unknown } | null
  if (!file || file.format !== FORMAT || !Array.isArray(file.applications)) {
    throw new ImportError('Este arquivo não é um backup exportado por este painel.')
  }
  const applications = parseApplications(file.applications)
  if (applications.length === 0) {
    throw new ImportError('Nenhuma candidatura válida encontrada no arquivo.')
  }
  return applications
}

/**
 * Imported entries join the current list; for a job in both, the most recently updated wins.
 * The list stays within MAX_APPLICATIONS (current entries first).
 */
export function mergeApplications(
  current: readonly Application[],
  imported: readonly Application[],
): { applications: Application[]; added: number; updated: number } {
  const byId = new Map(current.map((item) => [item.job.id, item]))
  let added = 0
  let updated = 0
  for (const item of imported) {
    const existing = byId.get(item.job.id)
    if (!existing) {
      if (byId.size >= MAX_APPLICATIONS) continue
      byId.set(item.job.id, item)
      added += 1
    } else if (item.updatedAt > existing.updatedAt) {
      byId.set(item.job.id, item)
      updated += 1
    }
  }
  return { applications: [...byId.values()], added, updated }
}
