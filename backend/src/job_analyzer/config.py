"""Application settings, read from environment variables and an optional backend/.env file.

Nothing is hardcoded in the code: endpoints, limits, CORS origins and hosts all come from here.
The current sources need no credentials; a future one that does must declare them as SecretStr
(masked in reprs, logs and tracebacks) with no default value.
"""

from __future__ import annotations

from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any, Literal, Self
from urllib.parse import urlsplit

from pydantic import Field, HttpUrl, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

from job_analyzer.models import SourceName

BACKEND_DIR = Path(__file__).resolve().parents[2]

DEFAULT_GUPY_TERMS = (
    # Dados
    "dados",
    "data",
    "analista de dados",
    "engenharia de dados",
    "ciencia de dados",
    "business intelligence",
    "bi",
    "power bi",
    "analytics",
    "inteligencia artificial",
    # Automação
    "automacao",
    "rpa",
    "qa",
    "testes",
    "devops",
    # Desenvolvimento
    "desenvolvedor",
    "developer",
    "desenvolvimento de software",
    "programador",
    "software",
    "front-end",
    "back-end",
    "full stack",
    "mobile",
    "web",
    "sistemas",
    # Genéricos de tecnologia
    "tecnologia",
    "ti",
    # Suporte e Infraestrutura
    "suporte tecnico",
    "suporte de ti",
    "help desk",
    "infraestrutura de ti",
    "redes",
    "seguranca da informacao",
)
# Entry-level titles that do not say "júnior", searched as they are (no level added).
DEFAULT_GUPY_ENTRY_TITLES = (
    "assistente de ti",
    "auxiliar de ti",
    "tecnico de ti",
    "tecnico de informatica",
    "auxiliar de informatica",
    "tecnico de suporte",
    "assistente de suporte",
    "auxiliar de suporte",
    "suporte n1",
    "assistente de help desk",
    "tecnico de redes",
    "assistente de infraestrutura",
    "tecnico de infraestrutura",
    "assistente de sistemas",
    "assistente de dados",
    "analista de dados i",
    "analista de suporte i",
    "analista de sistemas i",
    "analista de infraestrutura i",
    "desenvolvedor i",
    "engenheiro de software i",
)

CsvList = Annotated[list[str], NoDecode]


def _search_terms(terms: list[str]) -> list[str]:
    if any(len(term) > 80 for term in terms):
        raise ValueError("search terms must have at most 80 characters")
    return list(dict.fromkeys(term.lower() for term in terms))


class Environment(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    PRODUCTION = "production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ------------------------------------------------------------------ general
    environment: Environment = Environment.DEVELOPMENT
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    data_dir: Path = BACKEND_DIR / "data"
    max_job_age_days: int = Field(default=180, ge=1, le=3650)
    max_data_file_mb: int = Field(default=50, ge=1, le=1024)
    max_raw_snapshots_per_source: int = Field(default=30, ge=1, le=1000)

    # ------------------------------------------------------------------ HTTP client
    http_timeout_seconds: float = Field(default=20.0, gt=0, le=120)
    http_max_retries: int = Field(default=3, ge=0, le=10)
    http_backoff_seconds: float = Field(default=1.0, ge=0, le=60)
    http_max_response_mb: int = Field(default=20, ge=1, le=200)
    request_delay_seconds: float = Field(default=1.0, ge=0, le=30)
    # Names the project and where to reach its author, so a source can ask instead of blocking.
    http_user_agent: str = Field(
        default=(
            "JobMarketSkillGapAnalyzer/0.1 (educational portfolio project;"
            " +https://github.com/guigofranca/job-market-skill-gap-analyzer)"
        ),
        min_length=5,
        max_length=200,
    )

    # ------------------------------------------------------------------ sources
    enabled_sources: Annotated[list[SourceName], NoDecode] = Field(
        default_factory=lambda: [SourceName.GUPY, SourceName.SOLIDES]
    )

    gupy_api_url: HttpUrl = HttpUrl("https://portal.gupy.io/api/job-search/jobs")
    gupy_search_terms: CsvList = Field(default_factory=lambda: list(DEFAULT_GUPY_TERMS))
    gupy_entry_titles: CsvList = Field(default_factory=lambda: list(DEFAULT_GUPY_ENTRY_TITLES))
    gupy_page_size: int = Field(default=50, ge=10, le=100)
    gupy_max_pages_per_query: int = Field(default=2, ge=1, le=10)

    solides_api_url: HttpUrl = HttpUrl("https://vagas.solides.com.br/api/vacancies")
    solides_max_pages_per_query: int = Field(default=20, ge=1, le=100)

    # ------------------------------------------------------------------ API
    api_host: str = "127.0.0.1"
    api_port: int = Field(default=8000, ge=1, le=65535)
    api_cors_origins: CsvList = Field(default_factory=lambda: ["http://localhost:5173"])
    api_allowed_hosts: CsvList = Field(default_factory=lambda: ["localhost", "127.0.0.1"])
    # Each filter change fires ~8 requests (one per dashboard section): leave room for exploring.
    api_rate_limit_per_minute: int = Field(default=300, ge=1, le=100_000)
    # Request header with the real client IP, for proxies that overwrite it (Vercel: x-real-ip).
    # Unset, the socket address is used: never name a header that clients can set themselves.
    api_client_ip_header: str | None = Field(default=None, pattern=r"^[A-Za-z0-9-]{1,64}$")
    api_enable_docs: bool = True

    @field_validator(
        "enabled_sources",
        "gupy_search_terms",
        "gupy_entry_titles",
        "api_cors_origins",
        "api_allowed_hosts",
        mode="before",
    )
    @classmethod
    def _split_csv(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("gupy_search_terms")
    @classmethod
    def _validate_terms(cls, terms: list[str]) -> list[str]:
        if not terms:
            raise ValueError("at least one search term is required")
        return _search_terms(terms)

    @field_validator("gupy_entry_titles")
    @classmethod
    def _validate_entry_titles(cls, titles: list[str]) -> list[str]:
        # May be empty: the searches by level still run.
        return _search_terms(titles)

    @field_validator("data_dir")
    @classmethod
    def _resolve_data_dir(cls, value: Path) -> Path:
        # Relative paths are anchored to backend/ so commands behave the same from any cwd.
        return (value if value.is_absolute() else BACKEND_DIR / value).resolve()

    @field_validator("api_cors_origins")
    @classmethod
    def _validate_origins(cls, origins: list[str]) -> list[str]:
        for origin in origins:
            if origin == "*":
                continue
            parts = urlsplit(origin)
            if parts.scheme not in {"http", "https"} or not parts.netloc or parts.path:
                raise ValueError(f"invalid CORS origin {origin!r}: use scheme://host[:port]")
        return origins

    @model_validator(mode="after")
    def _production_hardening(self) -> Self:
        if self.environment is Environment.PRODUCTION:
            if "*" in self.api_cors_origins:
                raise ValueError("wildcard CORS origin is not allowed in production")
            if "*" in self.api_allowed_hosts:
                raise ValueError("wildcard allowed host is not allowed in production")
        return self

    @property
    def docs_enabled(self) -> bool:
        return self.api_enable_docs and self.environment is not Environment.PRODUCTION


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Settings are immutable for the lifetime of the process, so they are built once."""
    return Settings()
