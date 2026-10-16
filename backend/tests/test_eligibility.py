"""Requirement extraction, with phrasings taken from real postings."""

from __future__ import annotations

from datetime import date

import pytest

from job_analyzer.analytics.schemas import Conflict
from job_analyzer.analytics.service import Candidate, conflicts
from job_analyzer.models import Course, EnglishLevel, EnglishNeed, Requirements
from job_analyzer.processing.eligibility import course_matches, extract_requirements, weekly_hours
from job_analyzer.processing.sections import split_requirements
from job_analyzer.processing.text import matching_form

TODAY = date(2026, 10, 12)


def extract(description: str, title: str = "Estágio em Dados") -> Requirements:
    required, nice = split_requirements(title, description)
    return extract_requirements(required, nice, matching_form(description), today=TODAY)


def test_courses_and_open_lists() -> None:
    found = extract(
        "Requisitos e qualificações\nCursando Ciência da Computação, Sistemas de Informação, "
        "Estatística ou áreas correlatas;"
    )
    assert found.courses == [
        Course.CIENCIA_DA_COMPUTACAO,
        Course.SISTEMAS_DE_INFORMACAO,
        Course.ESTATISTICA,
    ]
    assert found.courses_open

    strict = extract("Requisitos:\nGraduação em andamento em Administração ou Engenharia;")
    assert strict.courses == [Course.ADMINISTRACAO, Course.ENGENHARIAS]
    assert not strict.courses_open


def test_course_list_broken_across_lines() -> None:
    found = extract(
        "Requisitos:\nCursando ensino superior em Administração,\nEngenharia, Estatística"
    )
    assert found.courses == [Course.ESTATISTICA, Course.ADMINISTRACAO, Course.ENGENHARIAS]


def test_courses_outside_education_sentences_are_ignored() -> None:
    found = extract(
        "Requisitos:\nEstatística básica;\nConhecimento em Python e Matemática financeira"
    )
    assert found.courses == []


@pytest.mark.parametrize(
    ("text", "required"),
    [
        ("Ensino superior completo em Ciência da Computação ou áreas afins.", True),
        ("Graduação completa em qualquer área;", True),
        ("Graduação completa ou em andamento em Engenharia.", False),
        ("Ensino superior cursando ou completo em TI.", False),
        ("Formação superior completa ou próxima da conclusão em Elétrica.", False),
        ("Ensino Médio completo;", False),
    ],
)
def test_degree_required(text: str, required: bool) -> None:
    assert (
        extract(f"Requisitos:\n{text}", title="Analista de Dados Júnior").degree_required
        is required
    )


@pytest.mark.parametrize(
    ("text", "low", "high"),
    [
        ("Cursando a partir do 4º período;", 4, None),
        ("Graduação em andamento (acima de 3o semestre) em ADS", 3, None),
        ("Cursando a partir do 3o ano dos cursos de Ciência da Computação", 5, None),
        ("Engenharia Mecânica (cursando entre 4o a 7o semestre);", 4, 7),
        # Durations are not course stages.
        ("Experiência de pelo menos 1 ano em Java;", None, None),
        ("Entre 1 e 4 anos de experiência;", None, None),
    ],
)
def test_semesters(text: str, low: int | None, high: int | None) -> None:
    found = extract(f"Requisitos:\n{text}")
    assert (found.min_semester, found.max_semester) == (low, high)


def test_a_desired_semester_is_not_a_requirement() -> None:
    found = extract("Requisitos:\nÉ desejável que esteja cursando entre o 4° ao 7° Semestre")
    assert (found.min_semester, found.max_semester) == (None, None)


@pytest.mark.parametrize(
    ("text", "start", "end"),
    [
        ("Com formatura prevista a partir de 2028.", "2028-01", None),
        ("Previsão de formatura a partir de junho/2028;", "2028-06", None),
        ("Formação acadêmica prevista entre 06/2028 e 12/2028;", "2028-06", "2028-12"),
        ("Com previsão de conclusão para 2028.", "2028-01", "2028-12"),
        ("Previsão de conclusão de curso a partir de 2028.1;", "2028-01", None),
        (
            "Previsão de formatura entre, aproximadamente, Fevereiro e Agosto de 2028",
            "2028-02",
            "2028-08",
        ),
        ("Previsão de formatura a partir de 2045.", None, None),  # implausible year
    ],
)
def test_graduation_window(text: str, start: str | None, end: str | None) -> None:
    found = extract(f"Requisitos:\n{text}")
    assert (found.graduation_from, found.graduation_to) == (start, end)


@pytest.mark.parametrize(
    ("text", "need", "level"),
    [
        ("Requisitos:\nInglês intermediário;", EnglishNeed.EXIGIDO, EnglishLevel.INTERMEDIARIO),
        (
            "Requisitos:\nInglês intermediário a avançado;",
            EnglishNeed.EXIGIDO,
            EnglishLevel.INTERMEDIARIO,
        ),
        (
            "Requisitos:\nInglês avançado para conversação, leitura e escrita;",
            EnglishNeed.EXIGIDO,
            EnglishLevel.AVANCADO,
        ),
        (
            "Requisitos:\nInglês técnico para leitura de documentação;",
            EnglishNeed.EXIGIDO,
            EnglishLevel.BASICO,
        ),
        (
            "Requisitos:\nLeitura fluente de documentações técnicas em Inglês.",
            EnglishNeed.EXIGIDO,
            EnglishLevel.BASICO,
        ),
        ("Requisitos:\nProficiência em inglês;", EnglishNeed.EXIGIDO, EnglishLevel.AVANCADO),
        (
            "Requisitos:\nEnsino superior cursando;\nInglês a partir do nível intermediário;\n"
            "Conhecimento básico em Python",
            EnglishNeed.EXIGIDO,
            EnglishLevel.INTERMEDIARIO,
        ),
        (
            "Requisitos:\nSQL;\nDiferenciais:\nInglês fluente",
            EnglishNeed.DIFERENCIAL,
            EnglishLevel.FLUENTE,
        ),
        ("Requisitos:\nInglês;", EnglishNeed.EXIGIDO, None),
    ],
)
def test_english(text: str, need: EnglishNeed, level: EnglishLevel | None) -> None:
    found = extract(text)
    assert (found.english, found.english_level) == (need, level)


def test_benefits_are_not_an_english_requirement() -> None:
    assert extract("Benefícios:\nReembolso para idiomas (inglês ou espanhol)").english is None


@pytest.mark.parametrize(
    ("text", "hours"),
    [
        ("Carga horária de 40h semanais", 40),
        ("Disponibilidade para estagiar 6h por dia, no período da manhã", 30),
        ("Jornada: seis horas diárias", 30),
        ("Disponibilidade para executar 30 horas de estágio\nsemanal.", 30),
        ("Suporte 24 horas por dia", None),
        ("Das 08h às 17h (SEG-SEX)", None),
    ],
)
def test_weekly_hours(text: str, hours: int | None) -> None:
    assert weekly_hours(matching_form(text).lower()) == hours


def test_course_groups() -> None:
    assert course_matches(Course.ADS, [Course.AREA_TECNOLOGIA])
    assert course_matches(Course.ENGENHARIA_DE_SOFTWARE, [Course.ENGENHARIAS])
    assert course_matches(Course.ADS, [Course.TECNOLOGIA_DA_INFORMACAO])
    assert not course_matches(Course.ADMINISTRACAO, [Course.AREA_EXATAS])


REQUIREMENTS = Requirements(
    courses=[Course.CIENCIA_DA_COMPUTACAO, Course.SISTEMAS_DE_INFORMACAO],
    degree_required=True,
    min_semester=4,
    graduation_from="2028-01",
    english=EnglishNeed.EXIGIDO,
    english_level=EnglishLevel.INTERMEDIARIO,
).model_dump(mode="json")


@pytest.mark.parametrize(
    ("level", "candidate", "expected"),
    [
        ("estagio", Candidate(graduated=True), [Conflict.ESTAGIO_FORMADO]),
        ("junior", Candidate(graduated=True), []),
        ("junior", Candidate(semester=6), [Conflict.SUPERIOR_COMPLETO]),
        ("estagio", Candidate(semester=2), [Conflict.SUPERIOR_COMPLETO, Conflict.SEMESTRE]),
        ("junior", Candidate(graduated=True, graduation="2026-12"), []),
        ("junior", Candidate(graduated=True, course=Course.ADS), [Conflict.CURSO]),
        ("junior", Candidate(graduated=True, course=Course.CIENCIA_DA_COMPUTACAO), []),
        ("junior", Candidate(english=EnglishLevel.BASICO), [Conflict.INGLES]),
        ("junior", Candidate(english=EnglishLevel.AVANCADO), []),
        ("junior", Candidate(), []),
    ],
)
def test_conflicts(level: str, candidate: Candidate, expected: list[Conflict]) -> None:
    assert conflicts(level, REQUIREMENTS, candidate) == expected


def test_graduation_conflict_and_open_course_lists() -> None:
    requirements = Requirements(
        courses=[Course.ADMINISTRACAO], courses_open=True, graduation_from="2028-01"
    ).model_dump(mode="json")
    candidate = Candidate(graduation="2027-06", course=Course.ADS)
    assert conflicts("estagio", requirements, candidate) == [Conflict.FORMATURA]
