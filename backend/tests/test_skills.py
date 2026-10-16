from __future__ import annotations

import re

import pytest

from job_analyzer.processing.skills import TAXONOMY, SkillExtractor
from job_analyzer.processing.text import matching_form

extractor = SkillExtractor()


def skills_in(text: str) -> set[str]:
    return set(extractor.extract(matching_form(text)))


def test_taxonomy_slugs_are_unique_and_well_formed() -> None:
    slugs = [spec.slug for spec in TAXONOMY]
    assert len(slugs) == len(set(slugs))
    assert all(re.fullmatch(r"[a-z0-9][a-z0-9-]{0,39}", slug) for slug in slugs)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Conhecimento em Python, SQL e Power BI", {"python", "sql", "power-bi"}),
        ("Experiência com JavaScript e TypeScript", {"javascript", "typescript"}),
        ("Back-end em Java com Spring Boot", {"java", "spring"}),
        ("Desenvolvimento em C# e .NET (ASP.NET Core)", {"csharp", "dotnet"}),
        ("Sistemas embarcados em C++", {"cpp"}),
        ("Linguagens: Python, R ou SAS", {"python", "r"}),
        ("Microsserviços em Go, Docker e Kubernetes", {"go", "docker", "kubernetes"}),
        (
            "Front-end com React.js; mobile com React Native",
            {"react", "react-native", "javascript"},
        ),
        ("Inglês intermediário e Excel avançado", {"english", "excel"}),
        (
            "Automação com UiPath, Power Automate e Selenium",
            {"uipath", "power-automate", "selenium"},
        ),
        ("Pipelines com PySpark no Databricks e Airflow", {"spark", "databricks", "airflow"}),
        ("APIs REST, Git e metodologias ágeis (Scrum)", {"rest-api", "git", "agile"}),
        ("Conhecimentos em IA generativa e LLMs", {"genai"}),
        (
            "Suporte Windows, Active Directory, redes TCP/IP e abertura de chamados (GLPI)",
            {"windows", "active-directory", "networking", "ticketing"},
        ),
        (
            "Boas práticas ITIL, Firewall Fortigate, VPN e VMware",
            {"itil", "firewall", "virtualization"},
        ),
        (
            "Manutenção de computadores e formatação; Microsoft 365 e Intune",
            {"hardware", "microsoft-365"},
        ),
        ("Conhecimento em segurança da informação e ISO 27001", {"information-security"}),
    ],
)
def test_extracts_expected_skills(text: str, expected: set[str]) -> None:
    assert expected <= skills_in(text)


@pytest.mark.parametrize(
    ("text", "absent"),
    [
        ("Bolsa auxílio de R$ 1.500,00", "r"),
        ("Rua R. Augusta, 100", "r"),
        ("Somos uma empresa que busca excelência", "excel"),
        ("You will excel at solving problems", "excel"),
        ("JavaScript é obrigatório", "java"),
        ("Hospedado em example.net", "dotnet"),
        ("Summer / Spring 2026 internship program", "spring"),
        ("Integração com ferramentas React Native", "react"),
        ("Go to market strategy", "go"),
        ("Trabalhamos com o DAX-Konzern", "dax"),
        ("Seguir as políticas de segurança da informação e LGPD", "information-security"),
        (
            "Atuar com as equipes de Infraestrutura, Redes e Segurança da Informação",
            "information-security",
        ),
        ("Somos uma empresa especializada em segurança da informação", "information-security"),
        ("Disponibilidade para trabalhar em redes sociais", "networking"),
    ],
)
def test_avoids_common_false_positives(text: str, absent: str) -> None:
    assert absent not in skills_in(text)


def test_accent_insensitive_matching() -> None:
    assert "statistics" in skills_in("Noções de Estatística")
    assert "english" in skills_in("INGLÊS avançado")


def test_empty_text_returns_no_skills() -> None:
    assert extractor.extract("") == []
