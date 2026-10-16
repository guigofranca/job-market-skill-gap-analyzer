from __future__ import annotations

from job_analyzer.models import Benefit
from job_analyzer.processing.benefits import extract_benefits
from job_analyzer.processing.text import html_to_text


def benefits_of(description: str) -> list[Benefit]:
    return extract_benefits(html_to_text(description, keep_lines=True))


def test_gupy_glued_text_benefits_section() -> None:
    # Gupy strips line breaks: headings, items and sentences run into each other.
    description = (
        "Somos uma empresa de tecnologia líder no setor.Responsabilidades e atribuições"
        "Atender clientes de plano de saúde.\n"
        "Requisitos e qualificaçõesCursando Engenharia;Conhecimento em SQL\n"
        "Informações adicionaisModelo de Trabalho: HíbridoJornada: 6h/dia"
        "O que oferecemos?• Vale Refeição• Plano de saúde e odontológico• Day off no aniversário"
        "• Auxílio CrecheWellHub e Totalpass;Home OfficePLR"
    )
    # The health-insurance duty in the responsibilities is not a benefit.
    assert benefits_of(description) == [
        Benefit.VALE_REFEICAO,
        Benefit.PLANO_SAUDE,
        Benefit.ODONTOLOGICO,
        Benefit.ACADEMIA,
        Benefit.PLR,
        Benefit.DAY_OFF,
        Benefit.CRECHE,
    ]


def test_html_lists_lead_ins_and_emoji_bullets() -> None:
    description = (
        "<p>Como Analista Jr. você será responsável por:</p><ul><li>Vender seguro de vida</li></ul>"
        "<p>Temos benefícios para cuidar de você:🏥 Assistência médica🍽️ Restaurante na empresa"
        "🚌 VT🎓 Parceria com instituições de ensino</p>"
        "<p>Queremos que todas as pessoas se sintam bem, por isso oferecemos terapia gratuita para "
        "candidatos que participarem do processo seletivo.</p>"
    )
    assert benefits_of(description) == [
        Benefit.REFEICAO_LOCAL,
        Benefit.VALE_TRANSPORTE,
        Benefit.PLANO_SAUDE,
        Benefit.EDUCACAO,
    ]


def test_benefits_mentioned_outside_a_section() -> None:
    description = (
        "Estágio em dados na área financeira.\nBolsa auxílio de R$ 1.500 + VT + VR.\n"
        "Horário flexível.\nVenha fazer parte do nosso time!"
    )
    assert benefits_of(description) == [
        Benefit.VALE_REFEICAO,
        Benefit.VALE_TRANSPORTE,
        Benefit.HORARIO_FLEXIVEL,
    ]


def test_requirements_never_become_benefits() -> None:
    description = (
        "Requisitos\nExperiência com sistemas de plano de saúde\n"
        "Conhecimento em previdência privada"
    )
    assert benefits_of(description) == []


def test_no_structure_means_no_benefits() -> None:
    assert benefits_of("") == []
    assert benefits_of("Uma vaga incrível para quem gosta de desafios.") == []


def test_solides_benefits_line() -> None:
    # Sólides lists benefits apart; the collector appends them as one labelled line.
    description = (
        "Desenvolver APIs.\nCompetências: SQL Server\n"
        "Benefícios: Convênio com Farmácia, Seguro de vida, Vale alimentação, "
        "Day-off de Aniversario, Plano de Saúde"
    )
    assert benefits_of(description) == [
        Benefit.VALE_REFEICAO,
        Benefit.PLANO_SAUDE,
        Benefit.SEGURO_VIDA,
        Benefit.DAY_OFF,
    ]
