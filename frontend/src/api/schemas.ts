import { z } from 'zod'

/*
 * Runtime contract of the backend API. Every response is parsed with these schemas before it
 * reaches React: unexpected shapes become a handled "invalid response" error instead of a crash,
 * and strings/numbers are bounded so a misbehaving server cannot inject absurd values.
 */

export const LEVELS = ['estagio', 'junior'] as const
export const AREAS = ['dados', 'automacao', 'desenvolvimento', 'infraestrutura'] as const
export const SOURCES = ['gupy', 'solides'] as const
/** No longer collected: jobs saved from them stay in "Minhas candidaturas". */
export const RETIRED_SOURCES = ['remotar'] as const
export const WORKPLACES = ['remoto', 'hibrido', 'presencial'] as const
export const CONTRACTS = ['clt', 'pj', 'estagio', 'temporario', 'freelancer'] as const
/** Benefits a posting mentions, in display order. */
export const BENEFITS = [
  'vale_refeicao',
  'refeicao_local',
  'vale_transporte',
  'plano_saude',
  'odontologico',
  'seguro_vida',
  'academia',
  'plr',
  'educacao',
  'home_office',
  'day_off',
  'horario_flexivel',
  'creche',
  'previdencia',
  'saude_mental',
] as const
export const AFFIRMATIVE_GROUPS = [
  'pcd',
  'mulheres',
  'pessoas-negras',
  'indigenas',
  'lgbtqia',
  'pessoas-40-mais',
] as const
export const INCLUSION = ['aceita-pcd', ...AFFIRMATIVE_GROUPS] as const
/** Courses postings ask for, then the groups they name instead of a course. */
export const COURSES = [
  'ciencia-da-computacao',
  'engenharia-da-computacao',
  'engenharia-de-software',
  'sistemas-de-informacao',
  'ads',
  'ciencia-de-dados',
  'tecnologia-da-informacao',
  'redes',
  'engenharia-outra',
  'estatistica',
  'matematica',
  'fisica',
  'economia',
  'administracao',
  'ciencias-contabeis',
  'engenharias',
  'area-tecnologia',
  'area-exatas',
] as const
/** Lowest to highest. */
export const ENGLISH_LEVELS = ['nenhum', 'basico', 'intermediario', 'avancado', 'fluente'] as const
export const CONFLICTS = [
  'estagio-formado',
  'superior-completo',
  'semestre',
  'formatura',
  'curso',
  'ingles',
] as const
export const CATEGORIES = [
  'linguagens',
  'dados_bi',
  'bancos_de_dados',
  'cloud_devops',
  'infra_suporte',
  'frameworks',
  'automacao_qa',
  'ia_ml',
  'competencias_gerais',
] as const

export const LevelSchema = z.enum(LEVELS)
export const AreaSchema = z.enum(AREAS)
export const SourceSchema = z.enum(SOURCES)
export const SavedSourceSchema = z.enum([...SOURCES, ...RETIRED_SOURCES])
export const CategorySchema = z.enum(CATEGORIES)
export const WorkplaceSchema = z.enum(WORKPLACES)
export const ContractSchema = z.enum(CONTRACTS)
export const BenefitSchema = z.enum(BENEFITS)
export const AffirmativeSchema = z.enum(AFFIRMATIVE_GROUPS)
export const InclusionSchema = z.enum(INCLUSION)
export const StateCodeSchema = z.string().regex(/^[A-Z]{2}$/)
export const CityKeySchema = z.string().regex(/^[a-z]{2}-[a-z0-9-]{1,80}$/)
/** "Published in the last N days" (the UI offers 7/15/30; the API accepts 1-365). */
export const SkillSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/)
export const CourseSchema = z.enum(COURSES)
export const EnglishLevelSchema = z.enum(ENGLISH_LEVELS)
export const ConflictSchema = z.enum(CONFLICTS)
/** "YYYY-MM". */
export const YearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

const count = z.number().int().nonnegative()
const share = z.number().min(0).max(1)
const label = z.string().min(1).max(120)
const isoDate = z.iso.date()

export const OptionSchema = z.object({ key: z.string().max(40), label, count })
export const CityOptionSchema = z.object({
  key: CityKeySchema,
  label,
  state: StateCodeSchema,
  count,
})

export const SkillRefSchema = z.object({
  slug: SkillSlugSchema,
  name: label,
  category: CategorySchema,
})

export const SkillStatSchema = SkillRefSchema.extend({ count, share })

export const MetaSchema = z.object({
  generated_at: z.iso.datetime({ offset: true }),
  total_jobs: count,
  period_start: isoDate.nullable(),
  period_end: isoDate.nullable(),
  levels: z.array(OptionSchema).max(10),
  areas: z.array(OptionSchema).max(10),
  states: z.array(OptionSchema).max(30),
  cities: z.array(CityOptionSchema).max(5000),
  workplaces: z.array(OptionSchema).max(10),
  inclusion: z.array(OptionSchema).max(10),
  categories: z.array(z.object({ key: CategorySchema, label })).max(20),
  skills: z.array(SkillStatSchema).max(500),
})

export const SummarySchema = z.object({
  total_jobs: count,
  distinct_skills: count,
  avg_skills_per_job: z.number().nonnegative().max(500),
  jobs_without_skills: count,
  top_skill: SkillStatSchema.nullable(),
  by_level: z.array(OptionSchema).max(10),
  by_area: z.array(OptionSchema).max(10),
  by_source: z.array(OptionSchema).max(20),
  by_category: z.array(z.object({ category: CategorySchema, label, count, share })).max(20),
})

export const TopSkillsSchema = z.object({
  total_jobs: count,
  items: z.array(SkillStatSchema).max(100),
})

export const LevelComparisonSchema = z.object({
  totals: z.object({ estagio: count, junior: count }),
  items: z
    .array(
      SkillRefSchema.extend({
        estagio_count: count,
        estagio_share: share,
        junior_count: count,
        junior_share: share,
      }),
    )
    .max(50),
})

export const LocationsSchema = z.object({
  /** Cities when a state is selected. */
  kind: z.enum(['state', 'city']),
  total_jobs: count,
  /** Jobs with no state (or city): mostly remote ones. */
  unlocated: count,
  items: z
    .array(OptionSchema.extend({ key: z.union([StateCodeSchema, CityKeySchema]), share }))
    .max(30),
})

export const WorkplacesSchema = z.object({
  items: z
    .array(
      z.object({
        /** null: all areas together. */
        area: AreaSchema.nullable(),
        label,
        total: count,
        /** Jobs that do not say where work happens (left out of the shares). */
        unknown: count,
        workplaces: z
          .array(OptionSchema.extend({ key: WorkplaceSchema, share }))
          .max(WORKPLACES.length),
      }),
    )
    .max(AREAS.length + 1),
})

export const GapSchema = z.object({
  total_jobs: count,
  /** Jobs asking for at least one known skill: the recommendations (and their shares) come from
      them, or from all jobs when there are none. Optional: an API deployed before it lacks it. */
  related_jobs: count.optional(),
  known: z.array(SkillStatSchema).max(100),
  avg_coverage: share,
  fully_covered: count,
  half_covered: count,
  recommendations: z.array(SkillStatSchema.extend({ unlocks: count })).max(50),
})

const TrendPointSchema = z.object({ day: z.iso.date(), count, share })
const SkillTrendSchema = SkillRefSchema.extend({
  points: z.array(TrendPointSchema).max(400),
  /** Share on the last day minus the share on the first day. */
  change: z.number().min(-1).max(1),
})

export const TrendsSchema = z.object({
  days: z.array(z.object({ day: z.iso.date(), jobs: count })).max(400),
  skills: z.array(SkillTrendSchema).max(10),
  rising: z.array(SkillTrendSchema).max(10),
  falling: z.array(SkillTrendSchema).max(10),
  /** Comparable days needed before a change is a trend (the API sends no movers before). An API
      deployed before this field existed gets the same rule. */
  min_days: z.number().int().min(2).max(60).default(7),
})

/** Who can apply, as stated by the posting. */
export const RequirementsSchema = z.object({
  courses: z.array(CourseSchema).max(COURSES.length),
  /** The course list is an example ("ou áreas afins"). */
  courses_open: z.boolean(),
  /** "Ensino superior completo". */
  degree_required: z.boolean(),
  min_semester: z.number().int().min(1).max(12).nullable(),
  max_semester: z.number().int().min(1).max(12).nullable(),
  graduation_from: YearMonthSchema.nullable(),
  graduation_to: YearMonthSchema.nullable(),
  english: z.enum(['exigido', 'diferencial']).nullable(),
  english_level: EnglishLevelSchema.nullable(),
  weekly_hours: z.number().int().min(1).max(60).nullable(),
})

export const JobSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{16}$/),
  source: SourceSchema,
  title: z.string().min(1).max(300),
  company: z.string().max(300).nullable(),
  location: z.string().max(300).nullable(),
  url: z.url({ protocol: /^https?$/ }),
  published_at: isoDate.nullable(),
  level: LevelSchema,
  area: AreaSchema,
  city: z.string().min(1).max(100).nullable(),
  state: StateCodeSchema.nullable(),
  workplace: WorkplaceSchema.nullable(),
  contracts: z.array(ContractSchema).max(5),
  affirmative: z.array(AffirmativeSchema).max(6),
  accepts_pcd: z.boolean(),
  /** Monthly BRL, only when the posting shows it. */
  salary_min: z.number().positive().max(100_000).nullable(),
  salary_max: z.number().positive().max(100_000).nullable(),
  /** Last day to apply, when known. */
  deadline: isoDate.nullable(),
  /** When a collection first found the posting. */
  first_seen: z.iso.datetime({ offset: true }).nullable(),
  requirements: RequirementsSchema,
  /** Required skills. */
  skills: z.array(SkillSlugSchema).max(100),
  /** Skills listed only as a plus ("diferencial"). */
  nice_to_have: z.array(SkillSlugSchema).max(100),
  /** Benefits the posting mentions, as tags (never its text). */
  benefits: z.array(BenefitSchema).max(BENEFITS.length).default([]),
  /** Requirements the visitor's profile does not meet (empty without a profile). */
  conflicts: z.array(ConflictSchema).max(CONFLICTS.length),
})

export const JobsSchema = z.object({
  total: count,
  /** Jobs in the filter the profile does not fit (counted before hiding them). */
  ineligible: count,
  limit: count,
  offset: count,
  items: z.array(JobSchema).max(100),
})

export const MatchSchema = JobSchema.extend({
  matched: z.array(SkillSlugSchema).max(100),
  missing: z.array(SkillSlugSchema).max(100),
  coverage: share,
})

export const MatchesSchema = z.object({
  total_jobs: count,
  ready: count,
  one_away: count,
  total: count,
  ineligible: count,
  limit: count,
  offset: count,
  items: z.array(MatchSchema).max(100),
})

export type Level = z.infer<typeof LevelSchema>
export type Area = z.infer<typeof AreaSchema>
export type Source = z.infer<typeof SourceSchema>
export type SavedSource = z.infer<typeof SavedSourceSchema>
export type Category = z.infer<typeof CategorySchema>
export type Workplace = z.infer<typeof WorkplaceSchema>
export type Contract = z.infer<typeof ContractSchema>
export type Benefit = z.infer<typeof BenefitSchema>
export type AffirmativeGroup = z.infer<typeof AffirmativeSchema>
export type Inclusion = z.infer<typeof InclusionSchema>
export type CityOption = z.infer<typeof CityOptionSchema>
export type SkillStat = z.infer<typeof SkillStatSchema>
export type Meta = z.infer<typeof MetaSchema>
export type Summary = z.infer<typeof SummarySchema>
export type TopSkills = z.infer<typeof TopSkillsSchema>
export type LevelComparison = z.infer<typeof LevelComparisonSchema>
export type Workplaces = z.infer<typeof WorkplacesSchema>
export type Locations = z.infer<typeof LocationsSchema>
export type Gap = z.infer<typeof GapSchema>
export type Trends = z.infer<typeof TrendsSchema>
export type SkillTrend = Trends['skills'][number]
export type Job = z.infer<typeof JobSchema>
export type Jobs = z.infer<typeof JobsSchema>
export type Match = z.infer<typeof MatchSchema>
export type Matches = z.infer<typeof MatchesSchema>

export type Course = z.infer<typeof CourseSchema>
export type EnglishLevel = z.infer<typeof EnglishLevelSchema>
export type Conflict = z.infer<typeof ConflictSchema>
export type Requirements = z.infer<typeof RequirementsSchema>

/** Skill extraction rules, compiled in the browser to read a CV locally. */
export const SkillPatternsSchema = z.object({
  items: z
    .array(
      z.object({
        slug: SkillSlugSchema,
        pattern: z.string().min(1).max(2000),
        ignore_case: z.boolean(),
      }),
    )
    .max(1000),
})
export type SkillPatterns = z.infer<typeof SkillPatternsSchema>
