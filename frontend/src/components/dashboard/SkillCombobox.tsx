// A native <select> or <datalist> cannot filter accent-insensitively as you type: this is the
// WAI-ARIA combobox pattern, so the listbox and option roles are deliberate.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import { Search } from 'lucide-react'
import { useId, useMemo, useState, type KeyboardEvent } from 'react'
import type { SkillStat } from '../../api/schemas'
import { matchingForm } from '../../lib/cvSkills'
import { formatNumber } from '../../lib/format'
import { CATEGORY_LABELS } from '../../lib/labels'

const MAX_OPTIONS = 60

function searchForm(text: string): string {
  return matchingForm(text).toLocaleLowerCase('pt-BR')
}

/**
 * Type to find a skill ("pyt", "estatistica" finds "Estatística"), most requested first.
 * WAI-ARIA combobox with a listbox popup: arrows move, Enter picks, Escape closes.
 */
export function SkillCombobox({
  label,
  skills,
  exclude,
  onSelect,
  disabled = false,
}: {
  label: string
  skills: readonly SkillStat[]
  exclude: readonly string[]
  onSelect: (slug: string) => void
  disabled?: boolean
}) {
  const inputId = useId()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const options = useMemo(() => {
    const needle = searchForm(query.trim())
    return skills
      .filter(
        (skill) =>
          skill.count > 0 &&
          !exclude.includes(skill.slug) &&
          (!needle || searchForm(skill.name).includes(needle)),
      )
      .slice(0, MAX_OPTIONS)
  }, [skills, exclude, query])
  const expanded = open && options.length > 0
  const current = Math.min(active, options.length - 1)
  const optionId = (index: number) => `${listId}-${index}`

  function pick(slug: string) {
    onSelect(slug)
    setQuery('')
    setActive(0)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current + step + options.length) % Math.max(options.length, 1))
    } else if (event.key === 'Enter' && expanded) {
      event.preventDefault()
      const option = options[current]
      if (option) pick(option.slug)
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative flex w-full flex-col gap-1.5 sm:w-80">
      <label htmlFor={inputId} className="text-muted text-xs font-medium">
        {label}
      </label>
      <div className="relative">
        <Search
          aria-hidden
          className="text-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded ? optionId(current) : undefined}
          autoComplete="off"
          spellCheck={false}
          className="select w-full pl-8"
          placeholder="Digite uma competência… (ex.: Python)"
          value={query}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div
        id={listId}
        role="listbox"
        aria-label={label}
        hidden={!expanded}
        className="border-line bg-surface absolute top-full z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border py-1 shadow-lg"
      >
        {options.map((skill, index) => (
          <div
            key={skill.slug}
            id={optionId(index)}
            role="option"
            tabIndex={-1}
            aria-selected={index === current}
            className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 text-sm ${index === current ? 'bg-surface-2 text-ink' : 'text-ink-2'}`}
            // mousedown, not click: picking must happen before the input's blur closes the list.
            onMouseDown={(event) => {
              event.preventDefault()
              pick(skill.slug)
            }}
            onMouseMove={() => setActive(index)}
          >
            <span className="min-w-0 truncate">
              {skill.name}
              <span className="text-muted ml-1.5 text-xs">{CATEGORY_LABELS[skill.category]}</span>
            </span>
            <span className="text-muted shrink-0 text-xs tabular-nums">
              {formatNumber(skill.count)} vagas
            </span>
          </div>
        ))}
      </div>
      {open && query.trim() && options.length === 0 && (
        <output className="text-muted text-xs">
          Nenhuma competência encontrada com “{query.trim()}”.
        </output>
      )}
    </div>
  )
}
