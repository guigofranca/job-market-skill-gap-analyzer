"""Read-only HTTP endpoints (GET only). All business logic lives in SkillAnalytics."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from job_analyzer import __version__
from job_analyzer.analytics import DatasetRepository, SkillAnalytics
from job_analyzer.analytics.schemas import (
    GapResponse,
    HealthResponse,
    JobsResponse,
    LevelComparisonResponse,
    LocationsResponse,
    MatchesResponse,
    MetaResponse,
    SkillPattern,
    SkillPatternsResponse,
    SummaryResponse,
    TopSkillsResponse,
    WorkplacesResponse,
)
from job_analyzer.api.params import (
    CompareParams,
    FilterParams,
    GapParams,
    JobsParams,
    LocationsParams,
    MatchParams,
    TopSkillsParams,
)
from job_analyzer.processing.skills import TAXONOMY, browser_patterns


def get_repository(request: Request) -> DatasetRepository:
    repository: DatasetRepository = request.app.state.repository
    return repository


def get_analytics(
    repository: Annotated[DatasetRepository, Depends(get_repository)],
) -> SkillAnalytics:
    return repository.get()  # raises DatasetUnavailableError -> 503


Analytics = Annotated[SkillAnalytics, Depends(get_analytics)]

health_router = APIRouter(tags=["health"])
router = APIRouter(prefix="/api/v1", tags=["analytics"])


@health_router.get("/health", response_model=HealthResponse)
def health(repository: Annotated[DatasetRepository, Depends(get_repository)]) -> HealthResponse:
    analytics = repository.peek()
    return HealthResponse(
        status="ok" if analytics else "degraded",
        version=__version__,
        dataset_loaded=analytics is not None,
        generated_at=analytics.metadata.generated_at if analytics else None,
        total_jobs=analytics.total_jobs if analytics else 0,
    )


@router.get("/meta", response_model=MetaResponse, summary="Filtros disponíveis e visão geral")
def meta(analytics: Analytics) -> MetaResponse:
    return analytics.meta()


@router.get("/summary", response_model=SummaryResponse, summary="KPIs das vagas filtradas")
def summary(analytics: Analytics, params: Annotated[FilterParams, Query()]) -> SummaryResponse:
    return analytics.summary(params.to_filters())


@router.get("/skills/top", response_model=TopSkillsResponse, summary="Skills mais exigidas")
def top_skills(
    analytics: Analytics, params: Annotated[TopSkillsParams, Query()]
) -> TopSkillsResponse:
    return analytics.top_skills(params.to_filters(), limit=params.limit, category=params.category)


@router.get(
    "/skills/compare-levels",
    response_model=LevelComparisonResponse,
    summary="Estágio x Júnior: participação de cada skill",
)
def compare_levels(
    analytics: Analytics, params: Annotated[CompareParams, Query()]
) -> LevelComparisonResponse:
    return analytics.compare_levels(params.to_filters(), limit=params.limit)


@router.get(
    "/skills/patterns",
    response_model=SkillPatternsResponse,
    summary="Regras de extração de competências (para ler um currículo no navegador)",
)
def skill_patterns() -> SkillPatternsResponse:
    return SkillPatternsResponse(
        items=[
            SkillPattern(slug=spec.slug, pattern=pattern, ignore_case=ignore_case)
            for spec in TAXONOMY
            for pattern, ignore_case in browser_patterns(spec)
        ]
    )


@router.get(
    "/locations",
    response_model=LocationsResponse,
    summary="Vagas por estado, ou pelas cidades do estado filtrado (ignora o filtro de cidade)",
)
def locations(
    analytics: Analytics, params: Annotated[LocationsParams, Query()]
) -> LocationsResponse:
    return analytics.locations(params.to_filters(), limit=params.limit)


@router.get(
    "/workplaces",
    response_model=WorkplacesResponse,
    summary="Remoto, híbrido e presencial por área (ignora os filtros de área e modalidade)",
)
def workplaces(
    analytics: Analytics, params: Annotated[FilterParams, Query()]
) -> WorkplacesResponse:
    return analytics.workplaces(params.to_filters())


@router.get("/skills/gap", response_model=GapResponse, summary="Análise de gap para um perfil")
def skill_gap(analytics: Analytics, params: Annotated[GapParams, Query()]) -> GapResponse:
    return analytics.gap(params.to_filters(), known=params.known, limit=params.limit)


@router.get("/jobs", response_model=JobsResponse, summary="Vagas filtradas (paginadas)")
def jobs(analytics: Analytics, params: Annotated[JobsParams, Query()]) -> JobsResponse:
    return analytics.list_jobs(
        params.to_filters(),
        limit=params.limit,
        offset=params.offset,
        candidate=params.to_candidate(),
        hide_ineligible=params.hide_ineligible,
    )


@router.get(
    "/jobs/matches",
    response_model=MatchesResponse,
    summary="Vagas ordenadas pelo quanto combinam com um perfil",
)
def job_matches(analytics: Analytics, params: Annotated[MatchParams, Query()]) -> MatchesResponse:
    return analytics.matches(
        params.to_filters(),
        known=params.known,
        missing=params.missing,
        limit=params.limit,
        offset=params.offset,
        candidate=params.to_candidate(),
        hide_ineligible=params.hide_ineligible,
    )
