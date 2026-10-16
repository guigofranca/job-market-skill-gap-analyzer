"""Query-parameter models. `extra="forbid"` rejects unknown parameters with a 422 and every
value is validated (enums, bounded ints, known skill slugs, bounded text) before reaching Pandas."""

from __future__ import annotations

from dataclasses import replace
from typing import Annotated, Any

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
)

from job_analyzer.analytics.service import Candidate, Inclusion, JobFilters
from job_analyzer.models import (
    COURSE_GROUP_VALUES,
    Area,
    Course,
    EnglishLevel,
    Level,
    StateCode,
    Workplace,
    YearMonth,
)
from job_analyzer.processing.skills import SkillCategory, is_known_skill


def _ensure_known_skill(slug: str) -> str:
    if not is_known_skill(slug):
        # The value is not echoed back: error bodies never reflect user input.
        raise ValueError("unknown skill")
    return slug


def _split_csv(value: Any) -> Any:
    """Accept both `?skills=python,sql` and `?skills=python&skills=sql`."""
    items = [value] if isinstance(value, str) else value
    if isinstance(items, list | tuple):
        return [part.strip() for item in items for part in str(item).split(",") if part.strip()]
    return value


KnownSkill = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_lower=True, min_length=1, max_length=40),
    AfterValidator(_ensure_known_skill),
]
SkillList = Annotated[list[KnownSkill], BeforeValidator(_split_csv)]


class _Params(BaseModel):
    model_config = ConfigDict(extra="forbid")


CityKey = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_lower=True, pattern=r"^[a-z]{2}-[a-z0-9-]{1,80}$"),
]
UpperStateCode = Annotated[
    StateCode, BeforeValidator(lambda v: v.upper() if isinstance(v, str) else v)
]


class _ScopeParams(_Params):
    """Filters shared by every endpoint (everything except level and skill)."""

    area: Area | None = None
    state: UpperStateCode | None = None
    city: CityKey | None = None
    workplace: Workplace | None = None
    inclusion: Inclusion | None = None

    def to_filters(self) -> JobFilters:
        return JobFilters(
            area=self.area,
            state=self.state,
            city=self.city,
            workplace=self.workplace,
            inclusion=self.inclusion,
        )


class BaseFilterParams(_ScopeParams):
    level: Level | None = None

    def to_filters(self) -> JobFilters:
        return replace(super().to_filters(), level=self.level)


class FilterParams(BaseFilterParams):
    skill: KnownSkill | None = None

    def to_filters(self) -> JobFilters:
        return replace(super().to_filters(), skill=self.skill)


class TopSkillsParams(FilterParams):
    category: SkillCategory | None = None
    limit: int = Field(default=15, ge=1, le=50)


class LocationsParams(FilterParams):
    limit: int = Field(default=10, ge=1, le=30)


class CompareParams(_ScopeParams):
    skill: KnownSkill | None = None
    limit: int = Field(default=12, ge=1, le=30)

    def to_filters(self) -> JobFilters:
        return replace(super().to_filters(), skill=self.skill)


class GapParams(FilterParams):
    known: SkillList = Field(min_length=1, max_length=60)
    limit: int = Field(default=10, ge=1, le=30)


TitleQuery = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]
Since = Annotated[
    AwareDatetime | None, Field(description="Only jobs first collected after this moment")
]


def _concrete_course(course: Course) -> Course:
    if course in COURSE_GROUP_VALUES:
        raise ValueError("choose a course, not a group of courses")
    return course


class _CandidateParams(_Params):
    """The visitor's profile, to flag (or hide) jobs whose stated requirements it does not meet."""

    graduated: bool = False
    semester: int | None = Field(default=None, ge=1, le=12, description="Current semester")
    graduation: YearMonth | None = Field(default=None, description="Expected graduation, YYYY-MM")
    course: Annotated[Course, AfterValidator(_concrete_course)] | None = None
    english: EnglishLevel | None = None
    hide_ineligible: bool = False

    def to_candidate(self) -> Candidate:
        return Candidate(
            graduated=self.graduated,
            semester=self.semester,
            graduation=self.graduation,
            course=self.course,
            english=self.english,
        )


JobId = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{16}$")]
JobIdList = Annotated[list[JobId], BeforeValidator(_split_csv)]
# Bounds the query string too: 200 ids are ~3.4 kB of URL.
MAX_LISTED_IDS = 200


class _IdParams(_Params):
    ids: JobIdList | None = Field(
        default=None,
        max_length=MAX_LISTED_IDS,
        description="Only these job ids (e.g. saved jobs or the ones the visitor opened)",
    )
    exclude: JobIdList | None = Field(
        default=None,
        max_length=MAX_LISTED_IDS,
        description="Never these job ids (e.g. the ones the visitor already opened)",
    )

    def with_ids(self, filters: JobFilters) -> JobFilters:
        return replace(
            filters,
            ids=frozenset(self.ids) if self.ids is not None else None,
            exclude_ids=frozenset(self.exclude) if self.exclude else None,
        )


class MatchParams(FilterParams, _CandidateParams, _IdParams):
    known: SkillList = Field(min_length=1, max_length=60)
    missing: int | None = Field(default=None, ge=0, le=20)
    q: TitleQuery | None = None
    since: Since = None
    limit: int = Field(default=10, ge=1, le=50)
    offset: int = Field(default=0, ge=0, le=10_000)

    def to_filters(self) -> JobFilters:
        return self.with_ids(replace(super().to_filters(), query=self.q, since=self.since))


class JobsParams(FilterParams, _CandidateParams, _IdParams):
    q: TitleQuery | None = None
    since: Since = None
    limit: int = Field(default=20, ge=1, le=50)
    offset: int = Field(default=0, ge=0, le=10_000)

    def to_filters(self) -> JobFilters:
        return self.with_ids(replace(super().to_filters(), query=self.q, since=self.since))
