import { ChevronDown, FilterX, SlidersHorizontal } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import type { Filters } from '../../api/endpoints'
import {
  AreaSchema,
  CATEGORIES,
  InclusionSchema,
  LevelSchema,
  StateCodeSchema,
  WorkplaceSchema,
  type Meta,
  type SkillStat,
} from '../../api/schemas'
import { formatNumber } from '../../lib/format'
import { CATEGORY_LABELS } from '../../lib/labels'
import type { SeenFilter } from '../../lib/viewed'

interface FilterBarProps {
  meta: Meta
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  onReset: () => void
  /** The "Vistas" filter, only where there is a job list (the "Vagas" tab). */
  seen?: { mode: SeenFilter['mode'] | null; onChange: (mode: SeenFilter['mode'] | null) => void }
}

/**
 * The filters scope everything below, in both tabs. The four most used are always visible, as
 * dropdowns of equal width; the rest sit behind "Mais filtros" (with a count of the active ones)
 * to keep the page calm.
 */
export function FilterBar({ meta, filters, onChange, onReset, seen }: FilterBarProps) {
  const seenActive = seen?.mode ? 1 : 0
  const hasFilters =
    seenActive > 0 || Object.values(filters).some((value) => value !== undefined && value !== '')
  const moreActive =
    [filters.city, filters.inclusion, filters.skill].filter(
      (value) => value !== undefined && value !== '',
    ).length + seenActive
  // Open when a shared link already uses one of the hidden filters.
  const [showMore, setShowMore] = useState(moreActive > 0)
  const moreId = useId()
  // Phones: the whole panel folds behind one button, so the jobs are visible on the first screen.
  const activeCount =
    Object.values(filters).filter((value) => value !== undefined && value !== '').length +
    seenActive
  const [mobileOpen, setMobileOpen] = useState(false)
  const panelId = useId()
  const cities = meta.cities.filter(
    (city) => city.count > 0 && (!filters.state || city.state === filters.state),
  )

  return (
    <search className="card flex flex-col gap-4 p-4" aria-label="Filtros">
      <button
        type="button"
        className="btn justify-between sm:hidden"
        aria-expanded={mobileOpen}
        aria-controls={panelId}
        onClick={() => setMobileOpen((open) => !open)}
      >
        <span className="inline-flex items-center gap-1.5">
          <SlidersHorizontal aria-hidden className="size-4" />
          Filtros
          {activeCount > 0 && (
            <span className="bg-accent text-page rounded-full px-1.5 text-xs leading-5 font-semibold tabular-nums">
              {activeCount}
              <span className="sr-only"> ativos</span>
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={`size-4 transition-transform ${mobileOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <div id={panelId} className={`${mobileOpen ? 'flex' : 'hidden'} flex-col gap-4 sm:flex`}>
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <SelectField
            label="Nível"
            value={filters.level ?? ''}
            onChange={(value) => onChange({ level: LevelSchema.safeParse(value).data })}
          >
            <option value="">Todos</option>
            <CountedOptions options={meta.levels} />
          </SelectField>
          <SelectField
            label="Área"
            value={filters.area ?? ''}
            onChange={(value) => onChange({ area: AreaSchema.safeParse(value).data })}
          >
            <option value="">Todas</option>
            <CountedOptions options={meta.areas} />
          </SelectField>
          <SelectField
            label="Estado"
            value={filters.state ?? ''}
            onChange={(value) =>
              // A city from another state would make the filter empty: drop it.
              onChange({ state: StateCodeSchema.safeParse(value).data, city: undefined })
            }
          >
            <option value="">Todos</option>
            {meta.states.map((state) => (
              <option key={state.key} value={state.key}>
                {state.label} ({formatNumber(state.count)})
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Modalidade"
            value={filters.workplace ?? ''}
            onChange={(value) => onChange({ workplace: WorkplaceSchema.safeParse(value).data })}
          >
            <option value="">Todas</option>
            <CountedOptions options={meta.workplaces} />
          </SelectField>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-1">
            <button
              type="button"
              className="btn"
              aria-expanded={showMore}
              aria-controls={moreId}
              onClick={() => setShowMore((open) => !open)}
            >
              <SlidersHorizontal aria-hidden className="size-4" />
              Mais filtros
              {moreActive > 0 && (
                <span className="bg-accent text-page rounded-full px-1.5 text-xs leading-5 font-semibold tabular-nums">
                  {moreActive}
                  <span className="sr-only"> ativos</span>
                </span>
              )}
              <ChevronDown
                aria-hidden
                className={`size-4 transition-transform ${showMore ? 'rotate-180' : ''}`}
              />
            </button>
            {hasFilters && (
              <button type="button" className="btn" onClick={onReset}>
                <FilterX aria-hidden className="size-4" />
                Limpar
              </button>
            )}
          </div>
        </div>

        <div
          id={moreId}
          hidden={!showMore}
          className={`border-line grid grid-cols-1 items-end gap-3 border-t pt-4 sm:grid-cols-2 ${seen ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}
        >
          <SelectField
            label="Cidade"
            value={filters.city ?? ''}
            onChange={(value) => {
              const city = meta.cities.find((item) => item.key === value)
              onChange(city ? { city: city.key, state: city.state } : { city: undefined })
            }}
          >
            <option value="">Todas</option>
            {cities.map((city) => (
              <option key={city.key} value={city.key}>
                {city.label}
                {filters.state ? '' : ` – ${city.state}`} ({formatNumber(city.count)})
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Inclusão"
            value={filters.inclusion ?? ''}
            onChange={(value) => onChange({ inclusion: InclusionSchema.safeParse(value).data })}
          >
            <option value="">Todas as vagas</option>
            {meta.inclusion
              .filter((option) => option.count > 0)
              .map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label} ({formatNumber(option.count)})
                </option>
              ))}
          </SelectField>
          <SelectField
            label="Tecnologia"
            value={filters.skill ?? ''}
            onChange={(value) => onChange({ skill: value || undefined })}
          >
            <option value="">Todas</option>
            <SkillOptions skills={meta.skills} />
          </SelectField>
          {seen && (
            <SelectField
              label="Vistas"
              value={seen.mode ?? ''}
              onChange={(value) =>
                seen.onChange(value === 'hide' || value === 'only' ? value : null)
              }
            >
              <option value="">Todas</option>
              <option value="hide">Ocultar as já vistas</option>
              <option value="only">Só as já vistas</option>
            </SelectField>
          )}
        </div>
      </div>
    </search>
  )
}

/** Skills grouped by category, most requested first. */
export function SkillOptions({
  skills,
  exclude = [],
}: {
  skills: readonly SkillStat[]
  exclude?: readonly string[]
}) {
  return CATEGORIES.map((category) => {
    const options = skills.filter(
      (skill) => skill.category === category && skill.count > 0 && !exclude.includes(skill.slug),
    )
    if (options.length === 0) return null
    return (
      <optgroup key={category} label={CATEGORY_LABELS[category]}>
        {options.map((skill) => (
          <option key={skill.slug} value={skill.slug}>
            {skill.name} ({formatNumber(skill.count)})
          </option>
        ))}
      </optgroup>
    )
  })
}

/** "Estágio (113)": options of the dataset, hiding the ones with no jobs. */
function CountedOptions({
  options,
}: {
  options: readonly { key: string; label: string; count: number }[]
}) {
  return options
    .filter((option) => option.count > 0)
    .map((option) => (
      <option key={option.key} value={option.key}>
        {option.label} ({formatNumber(option.count)})
      </option>
    ))
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  const id = useId()
  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-muted text-xs font-medium">
        {label}
      </label>
      <select
        id={id}
        className="select w-full"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </div>
  )
}
