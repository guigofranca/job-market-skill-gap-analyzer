"""Query-time analytics over the processed dataset, implemented with Pandas.

The dataset is small (thousands of rows), so it is held in memory as two frames:
  * `jobs`: one row per job;
  * `job_skills`: one row per (job, skill) pair (the "long" format used for counting).
Every public method takes a JobFilters, so all dashboard widgets slice data the same way.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Hashable, Mapping, Sequence
from dataclasses import dataclass, replace
from datetime import date, datetime
from enum import StrEnum
from typing import Any

import pandas as pd

from job_analyzer.analytics.schemas import (
    AreaWorkplaces,
    CategoryOption,
    CategoryStat,
    CityOption,
    Conflict,
    GapRecommendation,
    GapResponse,
    JobItem,
    JobsResponse,
    LevelComparisonItem,
    LevelComparisonResponse,
    LocationsResponse,
    LocationStat,
    MatchesResponse,
    MatchItem,
    MetaResponse,
    Option,
    SkillRef,
    SkillStat,
    SummaryResponse,
    TopSkillsResponse,
    TrendsResponse,
    WorkplacesResponse,
    WorkplaceStat,
)
from job_analyzer.analytics.trends import skill_trends
from job_analyzer.brazil import BRAZILIAN_STATES, brazil_today
from job_analyzer.models import (
    Affirmative,
    Area,
    Course,
    Dataset,
    EnglishLevel,
    EnglishNeed,
    History,
    Level,
    Workplace,
)
from job_analyzer.processing.eligibility import course_matches
from job_analyzer.processing.skills import CATEGORY_LABELS, SKILLS_BY_SLUG, SkillCategory
from job_analyzer.processing.text import matching_form
from job_analyzer.sources import SOURCE_LABELS

LEVEL_LABELS: dict[str, str] = {Level.ESTAGIO: "Estágio", Level.JUNIOR: "Júnior"}
AREA_LABELS: dict[str, str] = {
    Area.DADOS: "Dados",
    Area.AUTOMACAO: "Automação",
    Area.DESENVOLVIMENTO: "Desenvolvimento",
    Area.INFRAESTRUTURA: "Suporte e Infraestrutura",
}
WORKPLACE_LABELS: dict[str, str] = {
    Workplace.REMOTO: "Remoto",
    Workplace.HIBRIDO: "Híbrido",
    Workplace.PRESENCIAL: "Presencial",
}


class Inclusion(StrEnum):
    """Inclusion filter: open to PcD candidates, or reserved for / prioritising a group."""

    ACEITA_PCD = "aceita-pcd"
    PCD = Affirmative.PCD.value
    MULHERES = Affirmative.MULHERES.value
    PESSOAS_NEGRAS = Affirmative.PESSOAS_NEGRAS.value
    INDIGENAS = Affirmative.INDIGENAS.value
    LGBTQIA = Affirmative.LGBTQIA.value
    PESSOAS_40_MAIS = Affirmative.PESSOAS_40_MAIS.value


INCLUSION_LABELS: dict[str, str] = {
    Inclusion.ACEITA_PCD: "Aceita PcD",
    Inclusion.PCD: "Afirmativa para PcD",
    Inclusion.MULHERES: "Afirmativa para mulheres",
    Inclusion.PESSOAS_NEGRAS: "Afirmativa para pessoas negras",
    Inclusion.INDIGENAS: "Afirmativa para indígenas",
    Inclusion.LGBTQIA: "Afirmativa para LGBTQIAPN+",
    Inclusion.PESSOAS_40_MAIS: "Afirmativa para pessoas 40+",
}
JOB_COLUMNS = [
    "id",
    "source",
    "title",
    "company",
    "location",
    "url",
    "published_at",
    "level",
    "area",
    "city",
    "state",
    "workplace",
    "contracts",
    "affirmative",
    "accepts_pcd",
    "salary_min",
    "salary_max",
    "deadline",
    "first_seen",
    "requirements",
    "skills",
    "nice_to_have",
    "benefits",
]
ENGLISH_SKILL = "english"
# A posting found at most this many days after it was published is a fresh find (a weekend
# without collection fits). Older ones were back-filled: a new source or search term found
# them, but they are not news.
FRESH_FIND_DAYS = 3


@dataclass(frozen=True, slots=True)
class JobFilters:
    level: Level | None = None
    area: Area | None = None
    skill: str | None = None
    query: str | None = None
    state: str | None = None
    city: str | None = None
    workplace: Workplace | None = None
    inclusion: Inclusion | None = None
    # "Nova para você": fresh finds collected after this moment (the previous visit).
    since: datetime | None = None
    # Only these jobs (e.g. the visitor's saved ones, to check they are still published).
    ids: frozenset[str] | None = None
    # Never these jobs (e.g. postings the visitor already opened).
    exclude_ids: frozenset[str] | None = None


@dataclass(frozen=True, slots=True)
class Candidate:
    """What visitors say about themselves (all optional); sent per request, never stored."""

    graduated: bool = False
    semester: int | None = None
    graduation: str | None = None  # "YYYY-MM"
    course: Course | None = None
    english: EnglishLevel | None = None

    @property
    def is_empty(self) -> bool:
        return self == Candidate()

    @property
    def is_student(self) -> bool:
        return not self.graduated and (self.semester is not None or self.graduation is not None)

    @property
    def speaks_english(self) -> bool:
        return self.english is not None and self.english is not EnglishLevel.NENHUM


def conflicts(level: str, requirements: Mapping[str, Any], candidate: Candidate) -> list[Conflict]:
    """The posting's stated requirements this candidate does not meet. Unknown = no conflict."""
    found: list[Conflict] = []
    req = requirements
    if candidate.graduated and level == Level.ESTAGIO:
        found.append(Conflict.ESTAGIO_FORMADO)
    if candidate.is_student and req["degree_required"]:
        found.append(Conflict.SUPERIOR_COMPLETO)
    if (
        candidate.semester is not None
        and not candidate.graduated
        and (
            (req["min_semester"] and candidate.semester < req["min_semester"])
            or (req["max_semester"] and candidate.semester > req["max_semester"])
        )
    ):
        found.append(Conflict.SEMESTRE)
    if (
        candidate.graduation
        and not candidate.graduated
        and (
            (req["graduation_from"] and candidate.graduation < req["graduation_from"])
            or (req["graduation_to"] and candidate.graduation > req["graduation_to"])
        )
    ):
        found.append(Conflict.FORMATURA)
    if (
        candidate.course
        and req["courses"]
        and not req["courses_open"]
        and not course_matches(candidate.course, [Course(item) for item in req["courses"]])
    ):
        found.append(Conflict.CURSO)
    if candidate.english and req["english"] == EnglishNeed.EXIGIDO:
        needed = EnglishLevel(req["english_level"] or EnglishLevel.BASICO)
        if _english_rank(candidate.english) < _english_rank(needed):
            found.append(Conflict.INGLES)
    return found


def _object_column(values: Sequence[object], like: pd.DataFrame) -> pd.Series:
    """A column of Python objects (lists) aligned with `like`."""
    return pd.Series(values, index=like.index, dtype="object")


def _english_rank(level: EnglishLevel) -> int:
    return list(EnglishLevel).index(level)


class SkillAnalytics:
    def __init__(
        self,
        dataset: Dataset,
        *,
        history: History | None = None,
        today: Callable[[], date] = brazil_today,
    ) -> None:
        self.metadata = dataset.metadata
        self.history = history or History()
        self._today = today
        records = [
            {
                **job.model_dump(mode="json", include=set(JOB_COLUMNS)),
                # Unknown slugs (taxonomy changed after processing) are ignored, not served.
                "skills": [slug for slug in job.skills if slug in SKILLS_BY_SLUG],
                "nice_to_have": [slug for slug in job.nice_to_have if slug in SKILLS_BY_SLUG],
            }
            for job in dataset.jobs
        ]
        jobs = pd.DataFrame.from_records(records, columns=JOB_COLUMNS)
        jobs["published_at"] = pd.to_datetime(jobs["published_at"], errors="coerce")
        jobs["deadline_at"] = pd.to_datetime(jobs["deadline"], errors="coerce")
        jobs["first_seen"] = pd.to_datetime(jobs["first_seen"], utc=True, errors="coerce")
        found_on = jobs["first_seen"].dt.tz_convert("UTC").dt.tz_localize(None).dt.normalize()
        jobs["fresh_find"] = (
            jobs["published_at"].isna()
            | (jobs["published_at"] >= found_on - pd.Timedelta(days=FRESH_FIND_DAYS))
        ).astype(bool)
        jobs["skill_set"] = jobs["skills"].map(frozenset)
        jobs["affirmative_set"] = jobs["affirmative"].map(frozenset)
        jobs["city_key"] = [
            city_key(city, state) for city, state in zip(jobs["city"], jobs["state"], strict=True)
        ]
        jobs["title_search"] = jobs["title"].map(search_form)
        jobs["skill_count"] = jobs["skills"].map(len).astype("int64")
        self.jobs = jobs.sort_values(
            "published_at", ascending=False, na_position="last", kind="stable"
        ).reset_index(drop=True)

        long = self.jobs[["id", "skills"]].explode("skills").dropna(subset=["skills"])
        long = long.rename(columns={"skills": "skill"})
        long["category"] = long["skill"].map(lambda slug: SKILLS_BY_SLUG[slug].category.value)
        self.job_skills = long.reset_index(drop=True)
        # Market-wide demand, used to list a job's skills from most to least requested.
        counts = self.job_skills["skill"].value_counts()
        self._demand: dict[str, int] = {str(slug): int(n) for slug, n in counts.items()}

    @property
    def total_jobs(self) -> int:
        return len(self.open_jobs())

    # ------------------------------------------------------------------ filtering
    def _open_mask(self) -> pd.Series:
        """Jobs still accepting applications. The dataset only changes once a day, so a deadline
        can pass between collections: closed jobs are dropped at query time, not just at build."""
        closed = self.jobs["deadline_at"] < pd.Timestamp(self._today())
        return ~closed.fillna(False).astype(bool)

    def open_jobs(self) -> pd.DataFrame:
        return self.jobs[self._open_mask()]

    def filter(self, filters: JobFilters) -> pd.DataFrame:
        jobs = self.jobs
        mask = self._open_mask()
        if filters.level:
            mask &= jobs["level"] == filters.level.value
        if filters.area:
            mask &= jobs["area"] == filters.area.value
        if filters.ids is not None:
            mask &= jobs["id"].isin(filters.ids)
        if filters.exclude_ids:
            mask &= ~jobs["id"].isin(filters.exclude_ids)
        if filters.skill:
            skill = filters.skill
            mask &= jobs["skill_set"].map(lambda skills: skill in skills).astype(bool)
        if filters.state:
            mask &= jobs["state"] == filters.state
        if filters.city:
            mask &= jobs["city_key"] == filters.city
        if filters.workplace:
            mask &= jobs["workplace"] == filters.workplace.value
        if filters.inclusion is Inclusion.ACEITA_PCD:
            mask &= jobs["accepts_pcd"].astype(bool)
        elif filters.inclusion:
            group = filters.inclusion.value
            mask &= jobs["affirmative_set"].map(lambda values: group in values).astype(bool)
        return jobs[mask & self._time_and_text_mask(filters)]

    def _time_and_text_mask(self, filters: JobFilters) -> pd.Series:
        jobs = self.jobs
        mask = pd.Series(True, index=jobs.index)
        if filters.since:
            since = pd.Timestamp(filters.since).tz_convert("UTC")
            collected = (jobs["first_seen"] > since).fillna(False).astype(bool)
            mask &= collected & jobs["fresh_find"]
        if filters.query:
            # Accent- and case-insensitive ("estagio" finds "Estágio"). regex=False: user text is
            # matched literally (no ReDoS, no regex injection).
            mask &= jobs["title_search"].str.contains(
                search_form(filters.query), regex=False, na=False
            )
        return mask

    def _skills_of(self, jobs: pd.DataFrame) -> pd.DataFrame:
        return self.job_skills[self.job_skills["id"].isin(jobs["id"])]

    # ------------------------------------------------------------------ endpoints
    def meta(self) -> MetaResponse:
        jobs = self.open_jobs()
        return MetaResponse(
            generated_at=self.metadata.generated_at,
            total_jobs=len(jobs),
            period_start=_date_or_none(jobs["published_at"].min()),
            period_end=_date_or_none(jobs["published_at"].max()),
            levels=_options(jobs["level"], LEVEL_LABELS),
            areas=_options(jobs["area"], AREA_LABELS),
            states=_state_options(jobs),
            cities=_city_options(jobs),
            workplaces=_options(jobs["workplace"], WORKPLACE_LABELS),
            inclusion=_inclusion_options(jobs),
            categories=[
                CategoryOption(key=key, label=label) for key, label in CATEGORY_LABELS.items()
            ],
            skills=_skill_stats(self._skills_of(jobs), len(jobs)),
        )

    def summary(self, filters: JobFilters) -> SummaryResponse:
        jobs = self.filter(filters)
        skills = self._skills_of(jobs)
        total = len(jobs)
        stats = _skill_stats(skills, total, exclude=filters.skill)
        jobs_per_category = skills.drop_duplicates(["id", "category"])["category"].value_counts()
        return SummaryResponse(
            total_jobs=total,
            distinct_skills=int(skills["skill"].nunique()),
            avg_skills_per_job=round(float(jobs["skill_count"].mean()), 2) if total else 0.0,
            jobs_without_skills=int((jobs["skill_count"] == 0).sum()),
            top_skill=stats[0] if stats else None,
            by_level=_options(jobs["level"], LEVEL_LABELS),
            by_area=_options(jobs["area"], AREA_LABELS),
            by_source=_options(jobs["source"], SOURCE_LABELS),
            by_category=[
                CategoryStat(
                    category=category,
                    label=CATEGORY_LABELS[category],
                    count=int(jobs_per_category.get(category.value, 0)),
                    share=_share(int(jobs_per_category.get(category.value, 0)), total),
                )
                for category in SkillCategory
            ],
        )

    def top_skills(
        self, filters: JobFilters, *, limit: int, category: SkillCategory | None = None
    ) -> TopSkillsResponse:
        jobs = self.filter(filters)
        skills = self._skills_of(jobs)
        if category:
            skills = skills[skills["category"] == category.value]
        stats = _skill_stats(skills, len(jobs), exclude=filters.skill)
        return TopSkillsResponse(total_jobs=len(jobs), items=stats[:limit])

    def compare_levels(self, filters: JobFilters, *, limit: int) -> LevelComparisonResponse:
        """Top skills of the filter, with their share among Estágio and among Júnior postings."""
        jobs = self.filter(replace(filters, level=None))
        skills = self._skills_of(jobs)
        totals = {level: int((jobs["level"] == level.value).sum()) for level in Level}
        level_of = jobs.set_index("id")["level"]
        counts = skills.assign(level=skills["id"].map(level_of)).groupby(["skill", "level"]).size()

        def count(slug: str, level: Level) -> int:
            return int(counts.get((slug, level.value), 0))

        items = [
            LevelComparisonItem(
                slug=stat.slug,
                name=stat.name,
                category=stat.category,
                estagio_count=count(stat.slug, Level.ESTAGIO),
                estagio_share=_share(count(stat.slug, Level.ESTAGIO), totals[Level.ESTAGIO]),
                junior_count=count(stat.slug, Level.JUNIOR),
                junior_share=_share(count(stat.slug, Level.JUNIOR), totals[Level.JUNIOR]),
            )
            for stat in _skill_stats(skills, len(jobs), exclude=filters.skill)[:limit]
        ]
        return LevelComparisonResponse(totals=totals, items=items)

    def locations(self, filters: JobFilters, *, limit: int) -> LocationsResponse:
        """Where the filtered jobs are: states by job count or, once a state is selected, its
        cities. The city filter is ignored: the chart compares cities."""
        jobs = self.filter(replace(filters, city=None))
        total = len(jobs)
        if filters.state:
            options: Sequence[Option] = _city_options(jobs)
            unlocated = int(jobs["city_key"].isna().sum())
        else:
            options = _state_options(jobs)
            unlocated = int(jobs["state"].isna().sum())
        return LocationsResponse(
            kind="city" if filters.state else "state",
            total_jobs=total,
            unlocated=unlocated,
            items=[
                LocationStat(
                    key=option.key,
                    label=option.label,
                    count=option.count,
                    share=_share(option.count, total),
                )
                for option in options[:limit]
            ],
        )

    def workplaces(self, filters: JobFilters) -> WorkplacesResponse:
        """Remote / hybrid / on-site split of all areas together, then of each area (most remote
        first). The area and workplace filters are ignored: the chart compares them."""
        jobs = self.filter(replace(filters, area=None, workplace=None))
        by_area = [
            _area_workplaces(area, AREA_LABELS[area], jobs[jobs["area"] == area.value])
            for area in Area
        ]
        by_area = [item for item in by_area if item.total]
        by_area.sort(key=lambda item: -item.workplaces[0].share)
        return WorkplacesResponse(
            items=[_area_workplaces(None, "Todas as áreas", jobs), *by_area] if by_area else []
        )

    def gap(self, filters: JobFilters, *, known: Sequence[str], limit: int) -> GapResponse:
        """How well a set of known skills covers the market, and what to learn next.

        coverage(job) = |known ∩ required| / |required|, over jobs that list at least one skill.
        `unlocks` counts the jobs whose only missing requirement is that skill.
        """
        jobs = self.filter(filters)
        jobs = jobs[jobs["skill_count"] > 0]
        total = len(jobs)
        known_set = frozenset(known)
        demand = _skill_stats(self._skills_of(jobs), total)
        demanded = {stat.slug: stat for stat in demand}
        known_stats = [
            demanded.get(slug) or SkillStat(**_ref(slug).model_dump(), count=0, share=0.0)
            for slug in dict.fromkeys(known)
        ]
        known_stats.sort(key=lambda stat: -stat.count)
        if total == 0:
            return GapResponse(
                total_jobs=0,
                known=known_stats,
                avg_coverage=0.0,
                fully_covered=0,
                half_covered=0,
                recommendations=[],
            )

        coverage = (
            jobs["skill_set"].map(lambda required: len(required & known_set)) / jobs["skill_count"]
        )
        missing = jobs["skill_set"].map(lambda required: required - known_set)
        missing_count = missing.map(len)
        unlocks = (
            missing[missing_count == 1].map(lambda remaining: next(iter(remaining))).value_counts()
        )

        recommendations = [
            GapRecommendation(**stat.model_dump(), unlocks=int(unlocks.get(stat.slug, 0)))
            for stat in demand
            if stat.slug not in known_set
        ][:limit]
        return GapResponse(
            total_jobs=total,
            known=known_stats,
            avg_coverage=round(float(coverage.mean()), 4),
            fully_covered=int((missing_count == 0).sum()),
            half_covered=int((coverage >= 0.5).sum()),
            recommendations=recommendations,
        )

    def list_jobs(
        self,
        filters: JobFilters,
        *,
        limit: int,
        offset: int,
        candidate: Candidate | None = None,
        hide_ineligible: bool = False,
    ) -> JobsResponse:
        jobs, ineligible = self._assess(self.filter(filters), candidate, hide=hide_ineligible)
        page = jobs.iloc[offset : offset + limit][[*JOB_COLUMNS, "conflicts"]]
        items = [
            JobItem.model_validate(_job_payload(record))
            for record in page.to_dict(orient="records")
        ]
        return JobsResponse(
            total=len(jobs), ineligible=ineligible, limit=limit, offset=offset, items=items
        )

    def _assess(
        self, jobs: pd.DataFrame, candidate: Candidate | None, *, hide: bool
    ) -> tuple[pd.DataFrame, int]:
        """Add each job's conflicts with the candidate; optionally drop the jobs that have any.
        Returns the jobs and how many had a conflict (before dropping)."""
        if candidate is None or candidate.is_empty:
            none: list[list[Conflict]] = [[] for _ in range(len(jobs))]
            return jobs.assign(conflicts=_object_column(none, jobs)), 0
        found = [
            conflicts(level, requirements, candidate)
            for level, requirements in zip(jobs["level"], jobs["requirements"], strict=True)
        ]
        assessed = jobs.assign(conflicts=_object_column(found, jobs))
        blocked = assessed["conflicts"].map(bool).astype(bool)
        ineligible = int(blocked.sum())
        return (assessed[~blocked] if hide else assessed), ineligible

    def matches(
        self,
        filters: JobFilters,
        *,
        known: Sequence[str],
        missing: int | None,
        limit: int,
        offset: int,
        candidate: Candidate | None = None,
        hide_ineligible: bool = False,
    ) -> MatchesResponse:
        """Jobs ranked by how close a profile is to applying.

        Order: fewest missing skills first ("ready to apply" on top), then the highest coverage,
        then the most matched skills (5 of 5 is stronger evidence than 1 of 1), then the most
        recent. Jobs without any detected skill cannot be assessed and are left out.
        `missing` keeps only the jobs lacking exactly that many skills. With a candidate profile,
        jobs whose stated requirements it does not meet go last (or are hidden).
        """
        jobs = self.filter(filters)
        jobs = jobs[jobs["skill_count"] > 0]
        jobs, ineligible = self._assess(jobs, candidate, hide=hide_ineligible)
        known_set = frozenset(known)
        if candidate and candidate.speaks_english:
            # The profile states an English level: "Inglês" is not missing (the level is checked
            # by the conflicts).
            known_set |= {ENGLISH_SKILL}
        missing_sets = jobs["skill_set"].map(lambda required: required - known_set)
        missing_count = missing_sets.map(len).astype("int64")
        ranked = jobs.assign(
            missing_set=missing_sets,
            missing_count=missing_count,
            matched_count=jobs["skill_count"] - missing_count,
            coverage=1 - missing_count / jobs["skill_count"],
            blocked=jobs["conflicts"].map(bool).astype(bool),
        )
        ready = int((missing_count == 0).sum())
        one_away = int((missing_count == 1).sum())
        if missing is not None:
            ranked = ranked[ranked["missing_count"] == missing]
        ranked = ranked.sort_values(
            ["blocked", "missing_count", "coverage", "matched_count", "published_at"],
            ascending=[True, True, False, False, False],
            na_position="last",
        )

        page = ranked.iloc[offset : offset + limit]
        items = [
            MatchItem.model_validate(
                {
                    **_job_payload(record),
                    "matched": self._by_demand(record["skill_set"] & known_set),
                    "missing": self._by_demand(record["missing_set"]),
                    "coverage": round(float(record["coverage"]), 4),
                }
            )
            for record in page[
                [*JOB_COLUMNS, "conflicts", "skill_set", "missing_set", "coverage"]
            ].to_dict(orient="records")
        ]
        return MatchesResponse(
            total_jobs=len(jobs),
            ready=ready,
            one_away=one_away,
            total=len(ranked),
            ineligible=ineligible,
            limit=limit,
            offset=offset,
            items=items,
        )

    def trends(
        self, *, level: Level | None, area: Area | None, days: int, limit: int
    ) -> TrendsResponse:
        """Open jobs per day and the share of the most requested skills, from history.json."""
        return skill_trends(self.history, level=level, area=area, days=days, limit=limit)

    def _by_demand(self, skills: frozenset[str]) -> list[str]:
        return sorted(skills, key=lambda slug: (-self._demand.get(slug, 0), slug))


# ---------------------------------------------------------------------- helpers
def _ref(slug: str) -> SkillRef:
    spec = SKILLS_BY_SLUG[slug]
    return SkillRef(slug=spec.slug, name=spec.name, category=spec.category)


def _skill_stats(
    job_skills: pd.DataFrame, total_jobs: int, *, exclude: str | None = None
) -> list[SkillStat]:
    """Skills ranked by number of postings; ties broken by name for a stable order."""
    if job_skills.empty or total_jobs == 0:
        return []
    counts = job_skills["skill"].value_counts()
    ordered = sorted(
        ((str(slug), int(count)) for slug, count in counts.items()),
        key=lambda item: (-item[1], SKILLS_BY_SLUG[item[0]].name),
    )
    return [
        SkillStat(**_ref(slug).model_dump(), count=count, share=_share(count, total_jobs))
        for slug, count in ordered
        if slug != exclude
    ]


def _share(count: int, total: int) -> float:
    return round(count / total, 4) if total else 0.0


def _area_workplaces(area: Area | None, label: str, jobs: pd.DataFrame) -> AreaWorkplaces:
    counts = jobs["workplace"].value_counts()
    known = int(counts.sum())
    return AreaWorkplaces(
        area=area,
        label=label,
        total=len(jobs),
        unknown=len(jobs) - known,
        workplaces=[
            WorkplaceStat(
                key=str(key),
                label=name,
                count=int(counts.get(str(key), 0)),
                share=_share(int(counts.get(str(key), 0)), known),
            )
            for key, name in WORKPLACE_LABELS.items()
        ],
    )


def _options(column: pd.Series, labels: Mapping[str, str]) -> list[Option]:
    counts = column.value_counts()
    return [
        Option(key=str(key), label=label, count=int(counts.get(str(key), 0)))
        for key, label in labels.items()
    ]


_SEARCH_SYNONYMS = (
    # "estagio" must also find "Estagiário(a)" (and vice versa): both become "estagio".
    (re.compile(r"\bestagiari[oa]s?\b|\bestagios\b"), "estagio"),
    # "junior" must also find "Jr" / "Jr." titles.
    (re.compile(r"\bjr\b\.?"), "junior"),
)


def search_form(text: str) -> str:
    """Accent-free, case-folded, single-spaced, with level synonyms unified:
    'Estagiário(a)  de DADOS' -> 'estagio(a) de dados'. Applied to titles and queries alike."""
    normalized = " ".join(matching_form(text).casefold().split())
    for pattern, replacement in _SEARCH_SYNONYMS:
        normalized = pattern.sub(replacement, normalized)
    return normalized


def city_key(city: object, state: object) -> str | None:
    """URL-safe, unambiguous city id: ('São Paulo', 'SP') -> 'sp-sao-paulo'."""
    if not isinstance(city, str) or not isinstance(state, str):
        return None
    slug = re.sub(r"[^a-z0-9]+", "-", matching_form(city).casefold()).strip("-")
    return f"{state.lower()}-{slug}" if slug else None


def _state_options(jobs: pd.DataFrame) -> list[Option]:
    counts = jobs["state"].value_counts()
    return [
        Option(key=str(code), label=BRAZILIAN_STATES[str(code)], count=int(count))
        for code, count in counts.items()
        if str(code) in BRAZILIAN_STATES
    ]


def _city_options(jobs: pd.DataFrame) -> list[CityOption]:
    located = jobs.dropna(subset=["city_key"])
    if located.empty:
        return []
    grouped = located.groupby("city_key", sort=False).agg(
        label=("city", "first"), state=("state", "first"), count=("id", "size")
    )
    grouped = grouped.reset_index().sort_values(
        ["count", "label"], ascending=[False, True], kind="stable"
    )
    return [
        CityOption(key=str(key), label=str(label), state=str(state), count=int(count))
        for key, label, state, count in zip(
            grouped["city_key"], grouped["label"], grouped["state"], grouped["count"], strict=True
        )
    ]


def _inclusion_options(jobs: pd.DataFrame) -> list[Option]:
    groups = jobs["affirmative"].explode().value_counts()
    accepts_pcd = int(jobs["accepts_pcd"].astype(bool).sum())
    return [
        Option(
            key=str(key),
            label=label,
            count=accepts_pcd if key == Inclusion.ACEITA_PCD else int(groups.get(str(key), 0)),
        )
        for key, label in INCLUSION_LABELS.items()
    ]


def _job_payload(record: Mapping[Hashable, Any]) -> dict[str, Any]:
    """A job row as API fields (pandas missing values become None)."""
    return {
        **{column: record[column] for column in JOB_COLUMNS},
        "company": _none_if_missing(record["company"]),
        "location": _none_if_missing(record["location"]),
        "city": _none_if_missing(record["city"]),
        "state": _none_if_missing(record["state"]),
        "workplace": _none_if_missing(record["workplace"]),
        "salary_min": _none_if_missing(record["salary_min"]),
        "salary_max": _none_if_missing(record["salary_max"]),
        "deadline": _none_if_missing(record["deadline"]),
        "published_at": _date_or_none(record["published_at"]),
        "first_seen": _datetime_or_none(record["first_seen"]),
        "conflicts": record.get("conflicts", []),
    }


def _date_or_none(value: object) -> date | None:
    return value.date() if isinstance(value, pd.Timestamp) else None


def _datetime_or_none(value: object) -> datetime | None:
    return value.to_pydatetime() if isinstance(value, pd.Timestamp) else None


def _none_if_missing(value: object) -> object:
    return None if value is None or (isinstance(value, float) and pd.isna(value)) else value
