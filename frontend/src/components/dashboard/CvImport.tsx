import { FileText, Upload } from 'lucide-react'
import { useId, useMemo, useState, type ChangeEvent } from 'react'
import type { Meta } from '../../api/schemas'
import { useSkillPatterns } from '../../hooks/useDashboardData'
import type { KnownSkills } from '../../hooks/useKnownSkills'
import { CvFileError, readCvFile } from '../../lib/cvFile'
import { compilePatterns, extractSkills } from '../../lib/cvSkills'
import { ErrorState } from '../feedback/States'

interface Found {
  source: string
  skills: string[]
  alreadyKnown: number
}

/**
 * Fills the skills profile from the visitor's CV (PDF, or .txt). The file is read in this browser
 * with the same rules the backend applies to job postings; it is never sent or stored.
 */
export function CvImport({
  meta,
  profile,
  known,
}: {
  meta: Meta
  profile: KnownSkills
  known: readonly string[]
}) {
  const [open, setOpen] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [found, setFound] = useState<Found | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const panelId = useId()
  const fileId = useId()
  const patterns = useSkillPatterns(open)
  const compiled = useMemo(
    () => (patterns.data ? compilePatterns(patterns.data) : []),
    [patterns.data],
  )
  const ready = compiled.length > 0
  const inDataset = useMemo(() => new Set(meta.skills.map((skill) => skill.slug)), [meta.skills])
  const nameOf = (slug: string) => meta.skills.find((skill) => skill.slug === slug)?.name ?? slug

  const analyse = (content: string, source: string) => {
    const all = extractSkills(content, compiled).filter((slug) => inDataset.has(slug))
    const skills = all.filter((slug) => !known.includes(slug))
    setFound({ source, skills, alreadyKnown: all.length - skills.length })
    setSelected(new Set(skills))
  }

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = '' // choosing the same file again must work too
    if (!file) return
    setFileName(file.name)
    setError(null)
    setFound(null)
    setReading(true)
    try {
      analyse(await readCvFile(file), file.name)
    } catch (problem) {
      setError(
        problem instanceof CvFileError
          ? problem.message
          : 'Não conseguimos ler o arquivo. Tente exportar o currículo em PDF de novo.',
      )
    } finally {
      setReading(false)
    }
  }

  const apply = () => {
    for (const slug of found?.skills ?? []) if (selected.has(slug)) profile.add(slug)
    setOpen(false)
    setFileName(null)
    setFound(null)
    setError(null)
  }

  const toggle = (slug: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className="btn w-fit"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <FileText aria-hidden className="size-4" />
        Preencher com meu currículo
      </button>

      {open && (
        <div id={panelId} className="bg-surface-2 flex flex-col rounded-lg p-4">
          {patterns.isError ? (
            <ErrorState error={patterns.error} onRetry={() => void patterns.refetch()} />
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-ink text-sm font-medium">Envie o PDF do seu currículo</p>
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                {/* The native input is visually hidden (its text cannot be styled and gets cut);
                    the label is the visible, keyboard-focusable button. */}
                <input
                  id={fileId}
                  type="file"
                  accept=".pdf,application/pdf,.txt,text/plain"
                  disabled={!ready || reading}
                  onChange={(event) => void onFile(event)}
                  className="peer sr-only"
                />
                <label
                  htmlFor={fileId}
                  className="btn peer-focus-visible:outline-accent peer-disabled:pointer-events-none peer-disabled:opacity-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
                >
                  <Upload aria-hidden className="size-4" />
                  Escolher PDF
                </label>
                <span className="text-muted min-w-0 truncate text-sm">
                  {reading
                    ? 'Lendo o arquivo…'
                    : !ready
                      ? 'Carregando…'
                      : (fileName ?? 'Nenhum arquivo escolhido')}
                </span>
              </div>
            </div>
          )}

          <div aria-live="polite" className="flex flex-col gap-3 not-empty:mt-4">
            {error && <p className="text-danger text-sm">{error}</p>}
            {found &&
              (found.skills.length === 0 ? (
                <p className="text-ink-2 text-sm">
                  {found.alreadyKnown > 0
                    ? 'Todas as competências encontradas já estão no seu perfil.'
                    : 'Não encontramos competências conhecidas no currículo.'}
                </p>
              ) : (
                <>
                  <fieldset className="flex flex-col gap-2">
                    <legend className="text-ink mb-1 text-sm font-medium">
                      Encontramos {found.skills.length}{' '}
                      {found.skills.length === 1 ? 'competência nova' : 'competências novas'} em{' '}
                      {found.source}
                      {found.alreadyKnown > 0 &&
                        ` (e ${found.alreadyKnown} que você já tinha marcado)`}
                      . Desmarque o que não se aplica:
                    </legend>
                    <ul className="flex flex-wrap gap-1.5">
                      {found.skills.map((slug) => (
                        <li key={slug}>
                          <label className="border-line bg-surface text-ink has-checked:border-accent hover:border-accent inline-flex items-center transition-colors gap-1.5 rounded-full border py-0.5 pr-2.5 pl-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selected.has(slug)}
                              onChange={() => toggle(slug)}
                            />
                            {nameOf(slug)}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                  <button
                    type="button"
                    className="btn w-fit"
                    disabled={selected.size === 0}
                    onClick={apply}
                  >
                    Adicionar ao perfil ({selected.size})
                  </button>
                </>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
