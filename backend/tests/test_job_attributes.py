from __future__ import annotations

from datetime import timedelta

import pytest
from pydantic import ValidationError

from job_analyzer.analytics import JobFilters, SkillAnalytics
from job_analyzer.analytics.service import Inclusion, city_key
from job_analyzer.models import (
    Affirmative,
    Contract,
    Dataset,
    Level,
    RawJob,
    SourceName,
    Workplace,
)
from job_analyzer.pipeline import build_dataset
from job_analyzer.processing.attributes import (
    detect_affirmative,
    detect_contracts,
    detect_workplace,
    is_pcd_friendly,
    resolve_contracts,
)
from job_analyzer.processing.text import matching_form
from tests.conftest import NOW, RawJobFactory


# ---------------------------------------------------------------------- text rules
@pytest.mark.parametrize(
    ("title", "description", "expected"),
    [
        ("Estagiário de Dados | Vaga Afirmativa para Pessoas Negras", "", {"pessoas-negras"}),
        ("Analista de Dados Jr (AFIRMATIVA PARA MULHERES)", "", {"mulheres"}),
        ("Dev Júnior - Exclusiva para pessoas LGBTQIAP+", "", {"lgbtqia"}),
        ("Assistente de Dados PcD", "", {"pcd"}),
        ("Analista Contábil (Preferencialmente pessoas negras ou pardas)", "", {"pessoas-negras"}),
        (
            "Analista de Dados Jr",
            "Esta é uma vaga afirmativa para pessoas com +40 anos.",
            {"pessoas-40-mais"},
        ),
        ("Estágio em Dados", "Processo seletivo exclusivo para pessoas indígenas.", {"indigenas"}),
        # Not affirmative: an organisation name, a diversity statement, an inclusive PcD title.
        ("Analista de Sistemas Jr - Hospital da Mulher", "", set()),
        ("Analista de Dados Jr", "Incentivamos candidaturas de mulheres e pessoas negras.", set()),
        ("Analista de Dados (Inclusivo para Pessoas com Deficiência)", "", set()),
    ],
)
def test_detect_affirmative(title: str, description: str, expected: set[str]) -> None:
    found = detect_affirmative(matching_form(title), matching_form(description))
    assert {group.value for group in found} == expected


def test_pcd_friendly_wording() -> None:
    assert is_pcd_friendly(matching_form("Vaga também para PcD"))
    assert is_pcd_friendly(matching_form("(INCLUSIVO PARA PESSOAS COM DEFICIÊNCIA)"))
    assert not is_pcd_friendly("Desenvolvedor Python")


def test_detect_workplace_prefers_the_first_text_and_hybrid() -> None:
    assert detect_workplace("Dev Remoto ou Hibrido") is Workplace.HIBRIDO
    assert detect_workplace(None, "Home Office") is Workplace.REMOTO
    assert detect_workplace("Estagio - Presencial", "Remoto") is Workplace.PRESENCIAL
    # A missing location arrives from Pandas as NaN, not None.
    assert detect_workplace("Desenvolvedor Junior", float("nan")) is None
    assert detect_workplace("Analista de Dados", None) is None


def test_contract_resolution() -> None:
    assert detect_contracts("Contratacao CLT ou PJ") == [Contract.CLT, Contract.PJ]
    assert resolve_contracts([Contract.PJ], "regime CLT", Level.JUNIOR) == [Contract.PJ]
    assert resolve_contracts([], "regime CLT", Level.JUNIOR) == [Contract.CLT]
    assert resolve_contracts([], "bolsa auxilio", Level.ESTAGIO) == [Contract.ESTAGIO]
    assert resolve_contracts([], "sem detalhes", Level.JUNIOR) == []


# ---------------------------------------------------------------------- model rules
def test_raw_job_validates_states_and_upgrades_legacy_remote(raw_job: RawJobFactory) -> None:
    legacy = RawJob.model_validate({**raw_job().model_dump(mode="json"), "remote": True})
    assert legacy.workplace is Workplace.REMOTO
    with pytest.raises(ValidationError):
        raw_job(state="XX")  # not a Brazilian state
    assert raw_job(contracts=["clt", "clt", "pj"]).contracts == (Contract.CLT, Contract.PJ)


# ---------------------------------------------------------------------- pipeline + analytics
@pytest.fixture
def located_dataset(raw_job: RawJobFactory) -> Dataset:
    jobs = [
        raw_job(title="Estágio em Dados", city="São Paulo", state="SP", workplace="hibrido"),
        raw_job(
            title="Analista de Dados Júnior - Remoto",
            description="Contratação PJ. SQL e Python.",
            hints=[],
        ),
        raw_job(
            title="Desenvolvedor Júnior | Vaga Afirmativa para Mulheres",
            city="Campinas",
            state="SP",
            contracts=["clt"],
            accepts_pcd=True,
            hints=[],
        ),
        raw_job(
            title="Desenvolvedor Júnior PcD",
            city="Recife",
            state="PE",
            workplace="presencial",
            published_at=NOW - timedelta(days=20),
            hints=[],
        ),
    ]
    return build_dataset(jobs, max_age_days=180, now=NOW)


def test_pipeline_resolves_job_attributes(located_dataset: Dataset) -> None:
    by_title = {job.title: job for job in located_dataset.jobs}
    internship = by_title["Estágio em Dados"]
    assert (internship.city, internship.state, internship.workplace) == (
        "São Paulo",
        "SP",
        Workplace.HIBRIDO,
    )
    assert internship.contracts == [Contract.ESTAGIO]  # implied by the level

    remote = by_title["Analista de Dados Júnior - Remoto"]
    assert (remote.workplace, remote.contracts) == (Workplace.REMOTO, [Contract.PJ])

    women = by_title["Desenvolvedor Júnior | Vaga Afirmativa para Mulheres"]
    assert (women.affirmative, women.accepts_pcd) == ([Affirmative.MULHERES], True)

    pcd = by_title["Desenvolvedor Júnior PcD"]
    assert (pcd.affirmative, pcd.accepts_pcd) == ([Affirmative.PCD], True)


def test_location_workplace_and_inclusion_filters(located_dataset: Dataset) -> None:
    analytics = SkillAnalytics(located_dataset)

    def titles(**filters: object) -> set[str]:
        jobs = analytics.list_jobs(JobFilters(**filters), limit=50, offset=0)  # type: ignore[arg-type]
        return {job.title for job in jobs.items}

    assert len(titles(state="SP")) == 2
    assert titles(city="sp-campinas") == {"Desenvolvedor Júnior | Vaga Afirmativa para Mulheres"}
    assert titles(workplace=Workplace.REMOTO) == {"Analista de Dados Júnior - Remoto"}
    assert len(titles(inclusion=Inclusion.ACEITA_PCD)) == 2
    assert titles(inclusion=Inclusion.MULHERES) == {
        "Desenvolvedor Júnior | Vaga Afirmativa para Mulheres"
    }


def test_meta_describes_location_workplace_and_inclusion(located_dataset: Dataset) -> None:
    analytics = SkillAnalytics(located_dataset)
    meta = analytics.meta()
    assert [(state.key, state.label, state.count) for state in meta.states] == [
        ("SP", "São Paulo", 2),
        ("PE", "Pernambuco", 1),
    ]
    assert {(city.key, city.state) for city in meta.cities} == {
        ("sp-sao-paulo", "SP"),
        ("sp-campinas", "SP"),
        ("pe-recife", "PE"),
    }
    inclusion = {option.key: option.count for option in meta.inclusion}
    assert (inclusion["aceita-pcd"], inclusion["pcd"], inclusion["mulheres"]) == (2, 1, 1)

    assert {option.key: option.count for option in meta.workplaces} == {
        "remoto": 1,
        "hibrido": 1,
        "presencial": 1,
    }


def test_city_key_is_url_safe() -> None:
    assert city_key("São José dos Campos", "SP") == "sp-sao-jose-dos-campos"
    assert city_key(None, "SP") is None
    assert city_key("Recife", None) is None


def test_source_enum_is_unchanged_by_attribute_fields() -> None:
    # Guards against accidentally renaming the values stored in dataset.json.
    assert [source.value for source in SourceName] == ["gupy", "solides"]
