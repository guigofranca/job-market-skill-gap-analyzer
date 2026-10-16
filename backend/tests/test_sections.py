from __future__ import annotations

from datetime import date, timedelta

import pytest

from job_analyzer.models import RawJob
from job_analyzer.pipeline import build_dataset
from job_analyzer.processing.sections import split_requirements
from job_analyzer.processing.skills import SkillExtractor
from job_analyzer.processing.text import html_to_text
from tests.conftest import NOW, RawJobFactory

EXTRACT = SkillExtractor().extract


def skills_of(title: str, description: str) -> tuple[list[str], list[str]]:
    required, nice = split_requirements(title, html_to_text(description, keep_lines=True))
    required_skills = EXTRACT(required)
    return required_skills, [slug for slug in EXTRACT(nice) if slug not in required_skills]


def test_gupy_plain_text_with_glued_headings() -> None:
    # Gupy glues section titles to the text; company text sits in "Informações adicionais".
    description = (
        "Somos uma empresa de Inteligência Artificial líder no setor.\n"
        "Responsabilidades e atribuiçõesCriar dashboards no Power BI;Apoiar o time.\n"
        "Requisitos e qualificaçõesConhecimento em SQL e Excel; "
        "Conhecimento em Python será um diferencial;\n"
        "Informações adicionaisTrabalhamos com Docker e Kubernetes em toda a empresa."
    )
    required, nice = skills_of("Estágio em Dados", description)
    assert set(required) == {"power-bi", "sql", "excel"}
    assert nice == ["python"]
    # Neither the company's self-description nor the "additional info" counts.
    assert "ai" not in required
    assert "docker" not in required
    assert "docker" not in nice


def test_html_sections_and_lists() -> None:
    description = """
        <p>Você vai desenvolver APIs em Java com Spring Boot.</p>
        <h3>Requisitos</h3>
        <ul><li>Git</li><li>SQL</li></ul>
        <h3>Diferenciais</h3>
        <ul><li>Docker</li><li>Inglês intermediário</li></ul>
        <h3>Benefícios</h3>
        <ul><li>Curso de Python pago pela empresa</li></ul>
    """
    required, nice = skills_of("Desenvolvedor Júnior", description)
    assert {"java", "spring", "git", "sql"} <= set(required)
    assert set(nice) == {"docker", "english"}
    assert "python" not in required + nice  # benefits are ignored


@pytest.mark.parametrize(
    "line",
    [
        "Desejável: conhecimento em Python",
        "Diferenciais: Python",
        "Será um diferencial ter Python",
        "Python é um plus",
        "Requisitos desejáveis: Python",
    ],
)
def test_nice_to_have_wording(line: str) -> None:
    required, nice = skills_of("Analista de Dados Jr", f"Requisitos: SQL\n{line}")
    assert required == ["sql"]
    assert nice == ["python"]


def test_a_skill_required_and_also_praised_counts_as_required() -> None:
    required, nice = skills_of(
        "Analista de Dados Jr", "Requisitos: Python e SQL\nDiferencial: Python avançado e Docker"
    )
    assert set(required) == {"python", "sql"}
    assert nice == ["docker"]


def test_unstructured_description_counts_as_required() -> None:
    required, nice = skills_of("Dev Jr", "Atuar com React e TypeScript no front-end.")
    assert {"react", "typescript"} <= set(required)
    assert nice == []


def test_title_skills_are_always_required() -> None:
    required, _ = skills_of("Analista de Dados Power BI Jr", "Diferencial: Python")
    assert "power-bi" in required


# ---------------------------------------------------------------------- salary + deadline
def test_salary_bounds_and_order(raw_job: RawJobFactory) -> None:
    assert raw_job(salary_min=0, salary_max=1837).salary_min is None  # 0 = not informed
    assert raw_job(salary_max=120_000).salary_max is None  # implausible (cents?)
    swapped = raw_job(salary_min=3000, salary_max=1500)
    assert (swapped.salary_min, swapped.salary_max) == (1500, 3000)


def test_jobs_past_their_deadline_are_dropped(raw_job: RawJobFactory) -> None:
    today = NOW.date()
    jobs: list[RawJob] = [
        raw_job(title="Estágio em Dados", deadline=today + timedelta(days=5)),
        raw_job(title="Estágio em Dados (encerrada)", deadline=today - timedelta(days=1)),
        raw_job(title="Estágio em Dados (sem prazo)"),
    ]
    dataset = build_dataset(jobs, max_age_days=180, now=NOW)
    assert dataset.metadata.stats.expired == 1
    assert {job.title for job in dataset.jobs} == {
        "Estágio em Dados",
        "Estágio em Dados (sem prazo)",
    }
    open_job = next(job for job in dataset.jobs if job.deadline)
    assert open_job.deadline == date(2026, 10, 6)
