"""Domain models.

Everything that crosses a trust boundary (API payloads, files on disk) is parsed into one of these
Pydantic models, so malformed records are rejected before they reach Pandas or the API.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from enum import StrEnum
from typing import Annotated, Any, Final, Literal, Self

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    NonNegativeInt,
    StringConstraints,
    field_validator,
    model_validator,
)

from job_analyzer.brazil import BRAZILIAN_STATES

MAX_DESCRIPTION_CHARS = 50_000
MAX_HINTS = 20
MAX_HINT_CHARS = 100
# Monthly salary sanity bounds (BRL): outside them a value is a typo or a different unit.
MIN_MONTHLY_SALARY = 500
MAX_MONTHLY_SALARY = 50_000
SCHEMA_VERSION: Final = 1

SkillSlug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,39}$")]


class SourceName(StrEnum):
    GUPY = "gupy"
    SOLIDES = "solides"


class Level(StrEnum):
    ESTAGIO = "estagio"
    JUNIOR = "junior"


class Area(StrEnum):
    DADOS = "dados"
    AUTOMACAO = "automacao"
    DESENVOLVIMENTO = "desenvolvimento"
    INFRAESTRUTURA = "infraestrutura"  # suporte, infraestrutura, redes e segurança


class Benefit(StrEnum):
    """Benefits a posting mentions (see processing/benefits.py); the order is the display order."""

    VALE_REFEICAO = "vale_refeicao"
    REFEICAO_LOCAL = "refeicao_local"
    VALE_TRANSPORTE = "vale_transporte"
    PLANO_SAUDE = "plano_saude"
    ODONTOLOGICO = "odontologico"
    SEGURO_VIDA = "seguro_vida"
    ACADEMIA = "academia"
    PLR = "plr"
    EDUCACAO = "educacao"
    HOME_OFFICE = "home_office"
    DAY_OFF = "day_off"
    HORARIO_FLEXIVEL = "horario_flexivel"
    CRECHE = "creche"
    PREVIDENCIA = "previdencia"
    SAUDE_MENTAL = "saude_mental"


class Workplace(StrEnum):
    REMOTO = "remoto"
    HIBRIDO = "hibrido"
    PRESENCIAL = "presencial"


class Contract(StrEnum):
    CLT = "clt"
    PJ = "pj"
    ESTAGIO = "estagio"
    TEMPORARIO = "temporario"
    FREELANCER = "freelancer"


class Affirmative(StrEnum):
    """Groups an affirmative-action posting is reserved for (or prioritises)."""

    PCD = "pcd"
    MULHERES = "mulheres"
    PESSOAS_NEGRAS = "pessoas-negras"
    INDIGENAS = "indigenas"
    LGBTQIA = "lgbtqia"
    PESSOAS_40_MAIS = "pessoas-40-mais"


class Course(StrEnum):
    """Undergraduate courses postings ask for, plus the groups they name instead of a course."""

    CIENCIA_DA_COMPUTACAO = "ciencia-da-computacao"
    ENGENHARIA_DA_COMPUTACAO = "engenharia-da-computacao"
    ENGENHARIA_DE_SOFTWARE = "engenharia-de-software"
    SISTEMAS_DE_INFORMACAO = "sistemas-de-informacao"
    ADS = "ads"
    CIENCIA_DE_DADOS = "ciencia-de-dados"
    TECNOLOGIA_DA_INFORMACAO = "tecnologia-da-informacao"
    REDES = "redes"
    ENGENHARIA_OUTRA = "engenharia-outra"
    ESTATISTICA = "estatistica"
    MATEMATICA = "matematica"
    FISICA = "fisica"
    ECONOMIA = "economia"
    ADMINISTRACAO = "administracao"
    CONTABEIS = "ciencias-contabeis"
    # Groups (only in postings): "Engenharias", "áreas de tecnologia", "exatas".
    ENGENHARIAS = "engenharias"
    AREA_TECNOLOGIA = "area-tecnologia"
    AREA_EXATAS = "area-exatas"


COURSE_GROUP_VALUES: Final = frozenset(
    {Course.ENGENHARIAS, Course.AREA_TECNOLOGIA, Course.AREA_EXATAS}
)


class EnglishLevel(StrEnum):
    """Ordered from lowest to highest. NENHUM only describes candidates."""

    NENHUM = "nenhum"
    BASICO = "basico"
    INTERMEDIARIO = "intermediario"
    AVANCADO = "avancado"
    FLUENTE = "fluente"


class EnglishNeed(StrEnum):
    EXIGIDO = "exigido"
    DIFERENCIAL = "diferencial"


YearMonth = Annotated[str, StringConstraints(pattern=r"^\d{4}-(?:0[1-9]|1[0-2])$")]


class Requirements(BaseModel):
    """Who can apply, as stated by the posting (see processing/eligibility.py)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    courses: list[Course] = Field(default_factory=list, max_length=len(Course))
    courses_open: bool = Field(
        default=False, description='The course list is an example ("ou áreas afins")'
    )
    degree_required: bool = Field(default=False, description="Ensino superior completo")
    min_semester: int | None = Field(default=None, ge=1, le=12)
    max_semester: int | None = Field(default=None, ge=1, le=12)
    graduation_from: YearMonth | None = None
    graduation_to: YearMonth | None = None
    english: EnglishNeed | None = None
    english_level: EnglishLevel | None = None
    weekly_hours: int | None = Field(default=None, ge=1, le=60)


def _known_state(code: str) -> str:
    if code not in BRAZILIAN_STATES:
        raise ValueError("not a Brazilian state code")
    return code


StateCode = Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$"), AfterValidator(_known_state)]


class RawJob(BaseModel):
    """A job posting as delivered by a source, mapped to a common shape but not yet cleaned."""

    model_config = ConfigDict(frozen=True, extra="forbid", str_strip_whitespace=True)

    source: SourceName
    source_id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=2, max_length=300)
    company: str | None = Field(default=None, max_length=300)
    location: str | None = Field(default=None, max_length=300)
    description: str = ""
    url: HttpUrl
    published_at: AwareDatetime | None = None
    city: str | None = Field(default=None, max_length=100)
    state: StateCode | None = None
    workplace: Workplace | None = None
    contracts: tuple[Contract, ...] = ()
    affirmative: tuple[Affirmative, ...] = ()
    accepts_pcd: bool | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    deadline: date | None = Field(default=None, description="Last day to apply")
    hints: tuple[str, ...] = ()

    @model_validator(mode="before")
    @classmethod
    def _upgrade_legacy_remote(cls, data: Any) -> Any:
        # Snapshots written before `workplace` existed carry `remote: bool`.
        if isinstance(data, dict) and "remote" in data:
            data = dict(data)
            remote = data.pop("remote")
            if remote is True and data.get("workplace") is None:
                data["workplace"] = Workplace.REMOTO
        return data

    @field_validator("contracts", "affirmative", mode="before")
    @classmethod
    def _dedupe_tags(cls, value: Any) -> Any:
        if isinstance(value, list | tuple):
            return tuple(dict.fromkeys(value))
        return value

    @field_validator("description", mode="before")
    @classmethod
    def _truncate_description(cls, value: Any) -> Any:
        if value is None:
            return ""
        if isinstance(value, str) and len(value) > MAX_DESCRIPTION_CHARS:
            return value[:MAX_DESCRIPTION_CHARS]
        return value

    @field_validator("company", "location", "city", "state", mode="before")
    @classmethod
    def _blank_to_none(cls, value: Any) -> Any:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("hints", mode="before")
    @classmethod
    def _sanitize_hints(cls, value: Any) -> Any:
        if value is None:
            return ()
        if isinstance(value, list | tuple):
            cleaned = (str(item).strip()[:MAX_HINT_CHARS] for item in value if item is not None)
            return tuple(item for item in cleaned if item)[:MAX_HINTS]
        return value

    @field_validator("salary_min", "salary_max")
    @classmethod
    def _plausible_salary(cls, value: float | None) -> float | None:
        # Implausible values (0, typos, cents) are dropped rather than shown to job seekers.
        if value is None or not MIN_MONTHLY_SALARY <= value <= MAX_MONTHLY_SALARY:
            return None
        return round(value, 2)

    @model_validator(mode="after")
    def _ordered_salary_range(self) -> Self:
        if self.salary_min and self.salary_max and self.salary_min > self.salary_max:
            low, high = self.salary_max, self.salary_min
            object.__setattr__(self, "salary_min", low)
            object.__setattr__(self, "salary_max", high)
        return self

    @field_validator("published_at")
    @classmethod
    def _reject_future_dates(cls, value: datetime | None) -> datetime | None:
        # A posting "published" days in the future is corrupt data; keep the job, drop the date.
        if value is not None and value > datetime.now(UTC) + timedelta(days=2):
            return None
        return value


class RawSnapshot(BaseModel):
    """One collection run of one source, persisted under data/raw/<source>/."""

    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = SCHEMA_VERSION
    source: SourceName
    collected_at: AwareDatetime
    # Some requests failed: jobs missing from this snapshot may still be open.
    partial: bool = False
    jobs: list[RawJob]


class ProcessedJob(BaseModel):
    """A cleaned, classified job. Descriptions are intentionally not kept (only derived skills)."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str = Field(pattern=r"^[a-f0-9]{16}$")
    source: SourceName
    title: str = Field(min_length=2, max_length=300)
    company: str | None = Field(default=None, max_length=300)
    location: str | None = Field(default=None, max_length=300)
    url: HttpUrl
    published_at: date | None = None
    level: Level
    area: Area
    city: str | None = Field(default=None, max_length=100)
    state: StateCode | None = None
    workplace: Workplace | None = None
    contracts: list[Contract] = Field(default_factory=list, max_length=5)
    affirmative: list[Affirmative] = Field(default_factory=list, max_length=6)
    accepts_pcd: bool = False
    salary_min: float | None = None
    salary_max: float | None = None
    deadline: date | None = None
    first_seen: AwareDatetime | None = Field(
        default=None, description="When a collection first found the posting"
    )
    requirements: Requirements = Field(default_factory=Requirements)
    skills: list[SkillSlug] = Field(
        default_factory=list, max_length=100, description="Required skills"
    )
    nice_to_have: list[SkillSlug] = Field(
        default_factory=list, max_length=100, description="Skills listed only as a plus"
    )
    benefits: list[Benefit] = Field(
        default_factory=list, max_length=len(Benefit), description="Benefits the posting mentions"
    )


class SourceStats(BaseModel):
    model_config = ConfigDict(extra="forbid")

    raw: NonNegativeInt = 0
    kept: NonNegativeInt = 0


class ProcessingStats(BaseModel):
    """How many records were removed at each pipeline step (useful to audit data quality)."""

    model_config = ConfigDict(extra="forbid")

    raw_records: NonNegativeInt = 0
    delisted: NonNegativeInt = 0
    empty_title: NonNegativeInt = 0
    too_old: NonNegativeInt = 0
    expired: NonNegativeInt = 0
    duplicates: NonNegativeInt = 0
    out_of_scope_level: NonNegativeInt = 0
    out_of_scope_area: NonNegativeInt = 0
    kept: NonNegativeInt = 0


class DatasetMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = SCHEMA_VERSION
    generated_at: AwareDatetime
    max_job_age_days: int = Field(ge=1)
    stats: ProcessingStats
    sources: dict[SourceName, SourceStats]


class Dataset(BaseModel):
    model_config = ConfigDict(extra="forbid")

    metadata: DatasetMetadata
    jobs: list[ProcessedJob]


class HistorySegment(BaseModel):
    """One day's counts for the jobs of one level and area.

    Every job belongs to exactly one segment, so any level/area filter is a sum of segments.
    """

    model_config = ConfigDict(extra="forbid")

    level: Level
    area: Area
    jobs: NonNegativeInt
    workplace: dict[Workplace, NonNegativeInt] = Field(default_factory=dict)
    skills: dict[SkillSlug, NonNegativeInt] = Field(
        default_factory=dict, description="Jobs requiring each skill (nice-to-have not counted)"
    )


class HistoryPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    day: date = Field(description="Collection day in Brasília time")
    generated_at: AwareDatetime
    segments: list[HistorySegment]


class History(BaseModel):
    """Daily aggregates of the dataset, oldest first, one point per day (data/processed)."""

    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = SCHEMA_VERSION
    points: list[HistoryPoint] = Field(default_factory=list)

    @model_validator(mode="after")
    def _one_point_per_day(self) -> Self:
        days = [point.day for point in self.points]
        if days != sorted(set(days)):
            raise ValueError("points must be in chronological order, one per day")
        return self
