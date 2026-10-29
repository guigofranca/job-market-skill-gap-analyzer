"""Result models of the analytics service (also used as the API response contract)."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from job_analyzer.models import (
    Affirmative,
    Area,
    Benefit,
    Contract,
    Level,
    Requirements,
    SourceName,
    Workplace,
)
from job_analyzer.processing.skills import SkillCategory

Share = float  # fraction in [0, 1]


class Conflict(StrEnum):
    """A requirement of the posting the visitor's profile does not meet."""

    ESTAGIO_FORMADO = "estagio-formado"  # internships require being enrolled
    SUPERIOR_COMPLETO = "superior-completo"
    SEMESTRE = "semestre"
    FORMATURA = "formatura"
    CURSO = "curso"
    INGLES = "ingles"


class _Model(BaseModel):
    model_config = ConfigDict(frozen=True)


class Option(_Model):
    key: str
    label: str
    count: int = Field(ge=0)


class CityOption(Option):
    state: str


class CategoryOption(_Model):
    key: SkillCategory
    label: str


class SkillRef(_Model):
    slug: str
    name: str
    category: SkillCategory


class SkillStat(SkillRef):
    count: int = Field(ge=0)
    share: Share = Field(ge=0, le=1)


class CategoryStat(_Model):
    category: SkillCategory
    label: str
    count: int = Field(ge=0)
    share: Share = Field(ge=0, le=1)


class MetaResponse(_Model):
    generated_at: datetime
    total_jobs: int
    period_start: date | None
    period_end: date | None
    levels: list[Option]
    areas: list[Option]
    states: list[Option]
    cities: list[CityOption]
    workplaces: list[Option]
    inclusion: list[Option]
    categories: list[CategoryOption]
    skills: list[SkillStat]


class SummaryResponse(_Model):
    total_jobs: int
    distinct_skills: int
    avg_skills_per_job: float
    jobs_without_skills: int
    top_skill: SkillStat | None
    by_level: list[Option]
    by_area: list[Option]
    by_source: list[Option]
    by_category: list[CategoryStat]


class TopSkillsResponse(_Model):
    total_jobs: int
    items: list[SkillStat]


class LevelComparisonItem(SkillRef):
    estagio_count: int
    estagio_share: Share
    junior_count: int
    junior_share: Share


class LevelComparisonResponse(_Model):
    totals: dict[Level, int]
    items: list[LevelComparisonItem]


class LocationStat(Option):
    share: Share = Field(ge=0, le=1, description="Among all the filtered jobs")


class LocationsResponse(_Model):
    kind: Literal["state", "city"] = Field(description="Cities when a state is selected")
    total_jobs: int
    unlocated: int = Field(ge=0, description="Jobs with no state (or city); mostly remote ones")
    items: list[LocationStat]


class WorkplaceStat(Option):
    share: Share = Field(ge=0, le=1, description="Among the jobs that say where work happens")


class AreaWorkplaces(_Model):
    area: Area | None = Field(description="None: all areas together")
    label: str
    total: int = Field(ge=0)
    unknown: int = Field(ge=0, description="Jobs that do not say where work happens")
    workplaces: list[WorkplaceStat]


class WorkplacesResponse(_Model):
    items: list[AreaWorkplaces]


class GapRecommendation(SkillStat):
    unlocks: int = Field(
        ge=0,
        description="Related jobs fully covered once this single skill is learned",
    )


class GapResponse(_Model):
    total_jobs: int = Field(description="Jobs in the filter that list at least one skill")
    related_jobs: int = Field(
        ge=0,
        description=(
            "Jobs asking for at least one known skill. Recommendations, and their count and "
            "share, are among them (among all jobs when there are none)"
        ),
    )
    known: list[SkillStat]
    avg_coverage: Share
    fully_covered: int
    half_covered: int
    recommendations: list[GapRecommendation]


class TrendDay(_Model):
    day: date
    jobs: int = Field(ge=0, description="Open jobs of the level/area filter that day")


class TrendPoint(_Model):
    day: date
    count: int = Field(ge=0)
    share: Share = Field(ge=0, le=1)


class SkillTrend(SkillRef):
    points: list[TrendPoint]
    change: float = Field(
        ge=-1, le=1, description="Share on the last day minus the share on the first day"
    )


class TrendsResponse(_Model):
    days: list[TrendDay]
    skills: list[SkillTrend] = Field(description="Most requested on the last day")
    rising: list[SkillTrend]
    falling: list[SkillTrend]
    min_days: int = Field(
        ge=2,
        description="Comparable days needed before a change counts as a trend (no movers before)",
    )


class JobItem(_Model):
    id: str
    source: SourceName
    title: str
    company: str | None
    location: str | None
    url: str
    published_at: date | None
    level: Level
    area: Area
    city: str | None
    state: str | None
    workplace: Workplace | None
    contracts: list[Contract]
    affirmative: list[Affirmative]
    accepts_pcd: bool
    salary_min: float | None = Field(description="Monthly BRL, when the posting shows it")
    salary_max: float | None
    deadline: date | None = Field(description="Last day to apply, when known")
    first_seen: datetime | None = Field(description="When a collection first found the posting")
    requirements: Requirements = Field(description="Who can apply, as stated by the posting")
    skills: list[str] = Field(description="Required skills")
    nice_to_have: list[str] = Field(description="Skills listed only as a plus")
    benefits: list[Benefit] = Field(
        default_factory=list, description="Benefits the posting mentions, as tags"
    )
    conflicts: list[Conflict] = Field(
        default_factory=list, description="Requirements the given profile does not meet"
    )


class JobsResponse(_Model):
    total: int
    ineligible: int = Field(
        default=0, description="Jobs in the filter with a conflict (counted before hiding them)"
    )
    limit: int
    offset: int
    items: list[JobItem]


class MatchItem(JobItem):
    matched: list[str] = Field(description="Skills of the job the profile already has")
    missing: list[str] = Field(description="Skills the profile lacks, most requested first")
    coverage: Share = Field(description="matched / skills listed by the job")


class MatchesResponse(_Model):
    total_jobs: int = Field(description="Jobs in the filter that list at least one skill")
    ready: int = Field(description="Jobs whose every listed skill is in the profile")
    one_away: int = Field(
        description="Jobs missing exactly one skill, among those sharing one with the profile"
    )
    total: int = Field(description="Jobs matching the `missing` filter (paginated below)")
    ineligible: int = Field(
        default=0, description="Jobs in the filter with a conflict (counted before hiding them)"
    )
    limit: int
    offset: int
    items: list[MatchItem]


class SkillPattern(_Model):
    slug: str
    pattern: str = Field(description="JavaScript-compatible regular expression")
    ignore_case: bool


class SkillPatternsResponse(_Model):
    """The extraction rules, so a browser can read a CV locally (the text never leaves it).
    A skill is found when any of its patterns matches (a slug may have several). Texts must be
    in matching form first: Unicode NFKD without combining marks."""

    items: list[SkillPattern]


class HealthResponse(_Model):
    status: Literal["ok", "degraded"]
    version: str
    dataset_loaded: bool
    generated_at: datetime | None
    total_jobs: int
