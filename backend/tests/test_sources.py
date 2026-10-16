from __future__ import annotations

from datetime import date
from typing import Any

import httpx
import pytest

from job_analyzer.brazil import is_brazil, is_brazilian_state, state_code
from job_analyzer.config import Settings
from job_analyzer.http_client import HttpClient
from job_analyzer.models import Affirmative, Contract, SourceName, Workplace
from job_analyzer.sources import SOURCE_REGISTRY, build_sources
from job_analyzer.sources.base import entry_level_hints
from job_analyzer.sources.gupy import GupySource
from job_analyzer.sources.solides import SolidesSource


def gupy_item(job_id: int, **overrides: Any) -> dict[str, Any]:
    item = {
        "id": job_id,
        "name": "Estágio em Dados",
        "description": "Python &amp; SQL",
        "careerPageName": "ACME",
        "type": "vacancy_type_internship",
        "publishedDate": "2026-10-01T10:00:00.000Z",
        "workplaceType": "remote",
        "city": "Recife",
        "state": "Pernambuco",
        "jobUrl": f"https://acme.gupy.io/job/{job_id}",
        "disabilities": True,
        "applicationDeadline": "2026-10-20T00:00:00.000Z",
    }
    item.update(overrides)
    return item


def json_response(payload: Any) -> httpx.Response:
    return httpx.Response(200, json=payload)


def test_gupy_paginates_validates_and_deduplicates(settings: Settings) -> None:
    settings = settings.model_copy(
        update={"gupy_search_terms": ["dados"], "gupy_page_size": 2, "gupy_max_pages_per_query": 3}
    )
    seen_params: list[dict[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        params = dict(request.url.params)
        seen_params.append(params)
        if params.get("type") != "vacancy_type_internship":
            return json_response({"data": [], "pagination": {"total": 0}})
        pages = {
            "0": [gupy_item(1), gupy_item(2, jobUrl="javascript:alert(1)")],  # 2 is invalid
            "2": [gupy_item(1), gupy_item(3)],  # 1 is a duplicate
            "4": [gupy_item(4)],
        }
        return json_response({"data": pages[params["offset"]], "pagination": {"total": 5}})

    with HttpClient(settings, transport=httpx.MockTransport(handler), sleep=lambda _: None) as http:
        result = GupySource(settings, http).fetch()

    assert [job.source_id for job in result.jobs] == ["1", "3", "4"]
    assert (result.received, result.invalid, result.duplicates) == (5, 1, 1)
    first = result.jobs[0]
    assert first.location == "Recife, Pernambuco"
    assert (first.city, first.state, first.workplace) == ("Recife", "PE", Workplace.REMOTO)
    assert first.contracts == (Contract.ESTAGIO,)
    assert first.accepts_pcd is True
    assert first.deadline == date(2026, 10, 20)
    assert [params["jobName"] for params in seen_params[-2:]] == ["dados junior", "dados jr"]


def test_gupy_records_errors_and_keeps_partial_results(settings: Settings) -> None:
    settings = settings.model_copy(update={"gupy_search_terms": ["dados", "bi"]})

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.params["jobName"].startswith("bi"):
            return httpx.Response(404)
        return json_response({"data": [gupy_item(len(request.url.params["jobName"]))]})

    with HttpClient(settings, transport=httpx.MockTransport(handler), sleep=lambda _: None) as http:
        result = GupySource(settings, http).fetch()

    assert len(result.jobs) == 3  # "dados" + "dados junior" + "dados jr"
    assert len(result.errors) == 3  # every "bi" query failed
    assert not result.ok


def test_gupy_skips_postings_outside_brazil(settings: Settings) -> None:
    settings = settings.model_copy(update={"gupy_search_terms": ["dados"]})
    items = [
        gupy_item(1),
        gupy_item(2, city="Ciudad de México", state=""),
        gupy_item(3, city=None, state=None),  # remote, no location: kept
        gupy_item(4, city="Buenos Aires", state="Buenos Aires"),
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.params.get("type") != "vacancy_type_internship":
            return json_response({"data": []})
        return json_response({"data": items})

    with HttpClient(settings, transport=httpx.MockTransport(handler), sleep=lambda _: None) as http:
        result = GupySource(settings, http).fetch()

    assert [job.source_id for job in result.jobs] == ["1", "3"]
    assert (result.skipped, result.invalid) == (2, 0)


def solides_item(job_id: int, **overrides: Any) -> dict[str, Any]:
    item = {
        "id": job_id,
        "title": "Desenvolvedor Júnior",
        "description": "Desenvolver APIs.\r\nConhecimento em C#",
        "currentState": "em_andamento",
        "companyName": "ACME LTDA",
        "state": {"name": "Minas Gerais", "code": "MG"},
        "city": {"name": "BELO HORIZONTE", "stateId": 0},
        "jobType": "hibrido",
        "seniority": [{"name": "Junior", "level": None}],
        "hardSkills": [{"name": "SQL Server", "level": None}],
        "benefits": [
            {"name": "Vale alimentação", "level": None},
            {"name": "Day-off de Aniversario"},
        ],
        "createdAt": "2026-10-09",
        "recruitmentContractType": [{"name": "CLT"}, {"name": "PJ"}, {"name": "Cooperado"}],
        "affirmative": [
            {"name": "Vaga afirmativa para Mulheres"},
            {"name": "Vaga afirmativa para Pessoas com +40 anos"},
        ],
        "peopleWithDisabilities": True,
        "pcdOnly": False,
    }
    item.update(overrides)
    return item


def test_solides_queries_tech_area_paginates_and_maps(settings: Settings) -> None:
    seen: list[dict[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        params = dict(request.url.params)
        seen.append(params)
        assert params["occupationAreas"] == "tecnologia"
        if "seniorities" in params:
            return json_response({"totalPages": 1, "data": [solides_item(9)]})
        pages = {
            "1": [solides_item(1), solides_item(2, currentState="encerrada")],
            "2": [solides_item(3, seniority=[{"name": "Junior"}, {"name": "Sênior"}])],
        }
        return json_response({"totalPages": 2, "data": pages[params["page"]]})

    with HttpClient(settings, transport=httpx.MockTransport(handler), sleep=lambda _: None) as http:
        result = SolidesSource(settings, http).fetch()

    assert [job.source_id for job in result.jobs] == ["1", "3", "9"]
    assert result.skipped == 1  # the closed posting
    assert [params.get("title") for params in seen] == ["estagio", "estagio", None]
    job = result.jobs[0]
    assert job.location == "Belo Horizonte, MG"
    assert job.url.unicode_string() == "https://vagas.solides.com.br/vaga/1"
    assert job.published_at is not None
    assert job.published_at.tzinfo is not None
    assert "Competências: SQL Server" in job.description
    assert "Benefícios: Vale alimentação, Day-off de Aniversario" in job.description
    assert (job.workplace, job.hints) == (Workplace.HIBRIDO, ("Junior", "hibrido"))
    assert (job.city, job.state) == ("Belo Horizonte", "MG")
    assert job.contracts == (Contract.CLT, Contract.PJ)  # "Cooperado" has no equivalent
    assert job.affirmative == (Affirmative.MULHERES, Affirmative.PESSOAS_40_MAIS)
    assert job.accepts_pcd is True
    assert result.jobs[1].hints == ("hibrido",)  # ambiguous seniority: no level hint


def test_brazil_scope_helpers() -> None:
    assert is_brazilian_state("SP")
    assert is_brazilian_state("são paulo")
    assert not is_brazilian_state("Ciudad de México")
    assert not is_brazilian_state(None)
    assert is_brazil("Brasil")
    assert is_brazil("brazil")
    assert not is_brazil("Portugal")
    assert (state_code("Pará"), state_code("pa"), state_code("Paris")) == ("PA", "PA", None)
    assert entry_level_hints(["Estagiário", None, "Junior"]) == ["Estagiário", "Junior"]
    assert entry_level_hints(["Junior", "Pleno"]) == []


def test_unconfigured_sources_are_skipped(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    class NeedsKey(GupySource):
        @classmethod
        def is_configured(cls, settings: Settings) -> bool:
            return False

    monkeypatch.setitem(SOURCE_REGISTRY, SourceName.GUPY, NeedsKey)
    with HttpClient(settings) as http:
        sources = build_sources(settings, http, [SourceName.GUPY, SourceName.SOLIDES])
    assert [source.name for source in sources] == [SourceName.SOLIDES]


@pytest.mark.parametrize("payload", [[], {"data": "nope"}, {"unexpected": 1}])
def test_unexpected_payload_shapes_are_reported(settings: Settings, payload: Any) -> None:
    settings = settings.model_copy(update={"gupy_search_terms": ["dados"]})
    transport = httpx.MockTransport(lambda _: json_response(payload))
    with HttpClient(settings, transport=transport, sleep=lambda _: None) as http:
        result = GupySource(settings, http).fetch()
    assert result.jobs == []
    assert result.errors


@pytest.mark.parametrize(
    ("salary", "expected"),
    [
        # "simple": one value in finalRange (initialRange is 0).
        (
            {"type": "simple", "showRangeToApplicant": True, "initialRange": 0, "finalRange": 1837},
            (1837, 1837),
        ),
        (
            {
                "type": "range",
                "showRangeToApplicant": True,
                "initialRange": 1200,
                "finalRange": 1590,
            },
            (1200, 1590),
        ),
        # Hidden by the company, or not informed: no salary.
        (
            {
                "type": "simple",
                "showRangeToApplicant": False,
                "initialRange": 0,
                "finalRange": 3000,
            },
            (None, None),
        ),
        (
            {"type": "simple", "showRangeToApplicant": True, "initialRange": 0, "finalRange": 0},
            (None, None),
        ),
        (None, (None, None)),
    ],
)
def test_solides_salary(
    settings: Settings, salary: dict[str, Any] | None, expected: tuple[float | None, float | None]
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return json_response({"totalPages": 1, "data": [solides_item(1, salary=salary)]})

    with HttpClient(settings, transport=httpx.MockTransport(handler), sleep=lambda _: None) as http:
        result = SolidesSource(settings, http).fetch()
    job = result.jobs[0]
    assert (job.salary_min, job.salary_max) == expected
