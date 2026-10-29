from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from job_analyzer.config import Settings
from job_analyzer.models import Dataset, RawJob, SourceName
from job_analyzer.pipeline import build_dataset, make_store
from job_analyzer.storage import DataStore

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Isolated settings: no .env file, temp data dir, no politeness delays."""
    return Settings(
        _env_file=None,  # type: ignore[call-arg]
        environment="test",
        data_dir=tmp_path,
        request_delay_seconds=0,
        http_backoff_seconds=0,
        http_max_retries=2,
        api_allowed_hosts=["testserver"],
        api_cors_origins=["http://localhost:5173"],
        api_rate_limit_per_minute=1000,
    )


@pytest.fixture
def store(settings: Settings) -> DataStore:
    return make_store(settings)


RawJobFactory = Callable[..., RawJob]


@pytest.fixture
def raw_job() -> RawJobFactory:
    return _raw_job_factory()


def _raw_job_factory() -> RawJobFactory:
    counter = iter(range(1, 10_000))

    def factory(**overrides: Any) -> RawJob:
        n = next(counter)
        data: dict[str, Any] = {
            "source": SourceName.GUPY,
            "source_id": str(n),
            "title": "Estágio em Dados",
            "company": f"Empresa {n}",
            "location": "São Paulo, SP",
            "description": f"Vaga {n}: Python, SQL e Power BI.",
            "url": f"https://example.gupy.io/job/{n}",
            "published_at": NOW - timedelta(days=n % 20),
            "hints": ["vacancy_type_internship"],
        }
        data.update(overrides)
        return RawJob.model_validate(data)

    return factory


@pytest.fixture
def sample_raw_jobs(raw_job: RawJobFactory) -> list[RawJob]:
    return _sample_raw_jobs(raw_job)


def _sample_raw_jobs(raw_job: RawJobFactory) -> list[RawJob]:
    days = [timedelta(days=d) for d in range(0, 42, 3)]  # spread over 6 weeks
    jobs: list[RawJob] = []
    for i, delta in enumerate(days):
        jobs.append(
            raw_job(
                title="Estágio em Dados",
                description=f"Requisitos: Python, SQL, Excel e Power BI. Diferencial: Docker ({i})",
                published_at=NOW - delta,
            )
        )
        jobs.append(
            raw_job(
                title="Analista de Dados Júnior",
                description=f"SQL, Power BI, Python, Inglês avançado e Git ({i}).",
                published_at=NOW - delta,
                hints=[],
            )
        )
        jobs.append(
            raw_job(
                title="Desenvolvedor Front-end Júnior",
                description=f"React, TypeScript, HTML, CSS e Git ({i}).",
                published_at=NOW - delta,
                hints=[],
            )
        )
    jobs.append(raw_job(title="Engenheiro de Dados Sênior", description="Spark, Python", hints=[]))
    jobs.append(raw_job(title="Estágio em Marketing", description="Excel e comunicação"))
    return jobs


@pytest.fixture(scope="session")
def built_sample_dataset() -> Dataset:
    """Built once per run: the sample is deterministic (fixed clock and inputs), and building it
    was most of an API test's setup. Tests take `sample_dataset`, their own copy."""
    return build_dataset(_sample_raw_jobs(_raw_job_factory()), max_age_days=180, now=NOW)


@pytest.fixture
def sample_dataset(built_sample_dataset: Dataset) -> Dataset:
    return built_sample_dataset.model_copy(deep=True)
