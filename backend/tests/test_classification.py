from __future__ import annotations

import pytest

from job_analyzer.models import Area, Level
from job_analyzer.processing.classification import classify_area, classify_level


@pytest.mark.parametrize(
    ("title", "hints", "expected"),
    [
        ("Estágio em Engenharia de Dados", [], Level.ESTAGIO),
        ("Estagiário(a) de Desenvolvimento", [], Level.ESTAGIO),
        ("ESTAGIÁRIA - QA", [], Level.ESTAGIO),
        ("Data Analyst Intern", [], Level.ESTAGIO),
        ("Software Engineering Internship", [], Level.ESTAGIO),
        ("Analista de Dados Júnior", [], Level.JUNIOR),
        ("Desenvolvedor Jr - Python", [], Level.JUNIOR),
        ("Analista de BI Jr/Pl", [], Level.JUNIOR),
        ("Programa de Trainee Tecnologia", [], Level.JUNIOR),
        ("Analista de Dados", ["vacancy_type_internship"], Level.ESTAGIO),
        ("Software Engineer", ["Entry"], Level.JUNIOR),
        ("Pessoa Desenvolvedora", ["Estagiário", "presencial"], Level.ESTAGIO),
        ("Analista de Sistemas", ["junior"], Level.JUNIOR),
        ("Analista de Dados Sênior", ["vacancy_type_internship"], None),
        ("Desenvolvedor Pleno", [], None),
        ("Mid-level Full Stack Developer", ["junior"], None),
        ("Jovem Aprendiz | Inteligência Artificial", ["Estagiário"], None),
        ("Analista de Dados", ["vacancy_type_effective"], None),
        ("Jovem Aprendiz - Administrativo", ["vacancy_type_apprentice"], None),
    ],
)
def test_classify_level(title: str, hints: list[str], expected: Level | None) -> None:
    assert classify_level(title, hints) == expected


@pytest.mark.parametrize(
    ("title", "skills", "expected"),
    [
        ("Estágio em Engenharia de Dados", [], Area.DADOS),
        ("Analista de BI Júnior", [], Area.DADOS),
        ("Data Science Intern", [], Area.DADOS),
        ("Junior AI Engineer", [], Area.DADOS),
        ("Tax & Finance Operations Intern - AI Tax Startup", [], None),
        ("Desenvolvedor RPA Júnior", [], Area.AUTOMACAO),
        ("Estágio em QA / Testes", [], Area.AUTOMACAO),
        ("Estágio em Automação de Processos", [], Area.AUTOMACAO),
        ("Desenvolvedor Full Stack Júnior", [], Area.DESENVOLVIMENTO),
        ("Estágio em Desenvolvimento de Software", [], Area.DESENVOLVIMENTO),
        ("Junior Backend Developer", [], Area.DESENVOLVIMENTO),
        ("Estágio em Suporte Técnico", [], Area.INFRAESTRUTURA),
        ("Analista de Infraestrutura de TI Júnior", [], Area.INFRAESTRUTURA),
        ("Estagiário(a) de Infraestrutura", [], Area.INFRAESTRUTURA),
        ("TÉCNICO DE HELP DESK", [], Area.INFRAESTRUTURA),
        ("Analista de Redes Junior - Huawei - CISCO", [], Area.INFRAESTRUTURA),
        ("Analista de Segurança da Informação JR", [], Area.INFRAESTRUTURA),
        ("Estágio em TI - Operações e Sustentação", [], Area.INFRAESTRUTURA),
        ("Analista de TI Cloud JR", [], Area.INFRAESTRUTURA),
        # Testing and DevOps stay in Automação; a cloud developer is still a developer.
        ("Estágio em Testes de Software (Android, IA e Cibersegurança)", [], Area.AUTOMACAO),
        ("BANCO DE TALENTOS - DevOps & SRE Cloud (JR, PL e SR)", [], Area.AUTOMACAO),
        ("Desenvolvedor Cloud Júnior", [], Area.DESENVOLVIMENTO),
        # A bare "Suporte" title is decided by the skills (IT or customer care).
        ("Analista de Suporte Junior", ["windows", "networking", "ticketing"], Area.INFRAESTRUTURA),
        ("Analista de Suporte Junior", ["excel"], None),
        # Generic tech titles fall back to the skills requested.
        ("Estágio em TI", ["power-bi", "excel", "sql"], Area.DADOS),
        ("Estágio em TI", ["react", "html", "css"], Area.DESENVOLVIMENTO),
        ("Estágio em TI", ["excel"], None),
        # Not tech, or a lookalike.
        ("Estágio em Marketing", ["excel"], None),
        ("Estágio em Desenvolvimento Humano", [], None),
        ("Analista de Proteção de Dados (LGPD) Júnior", [], None),
        ("Gerente de Negócios Júnior (SOFTWARE)", [], None),
        ("Instalador-reparador de linhas de comunicação de dados Jr", [], None),
        ("Estagiário - Engenharia de Controle e Automação / Mecatrônica", [], None),
        ("Programador de Produção Jr (PCP) - Vaga Afirmativa", ["excel"], None),
        ("Programador(a) de Manutenção Júnior", [], None),
        ("Estágio em PCP", ["excel", "power-bi"], None),
        ("Programador CNC Júnior", [], None),
        ("Programador Júnior PHP", [], Area.DESENVOLVIMENTO),
        ("TÉCNICO DE FIBRA ÓPTICA JÚNIOR - INFRAESTRUTURA - N1", [], None),
        ("Comprador(a) Júnior - TI - Jd. Paulista", [], None),
        ("Analista de Suporte e Sucesso do Cliente", [], None),
        ("Assistente de Suporte ao Cliente - backoffice", [], None),
        ("Analista de Redes Sociais Jr", [], None),
    ],
)
def test_classify_area(title: str, skills: list[str], expected: Area | None) -> None:
    assert classify_area(title, skills) == expected
