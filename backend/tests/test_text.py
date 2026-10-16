from __future__ import annotations

from job_analyzer.processing.text import clean_inline, html_to_text, strip_accents


def test_html_is_stripped_and_entities_decoded() -> None:
    raw = "<p>Requisitos:</p><ul><li>Python &amp; SQL</li><li>Power&nbsp;BI</li></ul>"
    assert html_to_text(raw) == "Requisitos: Python & SQL Power BI"


def test_inline_markup_does_not_split_words() -> None:
    raw = "<p>Requisitos:</p><ul><li><b>E</b>xcel avançado</li><li><span>S</span>QL</li></ul>"
    assert html_to_text(raw, keep_lines=True) == "Requisitos:\nExcel avançado\nSQL"
    assert html_to_text(raw) == "Requisitos: Excel avançado SQL"


def test_words_broken_after_their_capital_are_joined() -> None:
    raw = "Experiência em dados;E\nxcel Avançado;S\nQL para análises\nTrabalho em equipe e A\nvaga"
    assert (
        html_to_text(raw, keep_lines=True)
        == "Experiência em dados;Excel Avançado;SQL para análises\nTrabalho em equipe e A\nvaga"
    )


def test_scripts_are_not_kept_as_markup() -> None:
    text = html_to_text('<p>Olá</p><img src=x onerror="alert(1)"><script>alert(1)</script>')
    assert "<" not in text
    assert "onerror" not in text


def test_plain_text_entities_and_invisible_characters() -> None:
    raw = "Dados &amp; BI" + chr(0x200B) + "\x00 com   espaços"
    assert html_to_text(raw) == "Dados & BI com espaços"


def test_clean_inline_bounds_length_and_blank_to_none() -> None:
    assert clean_inline("   ") is None
    assert clean_inline(None) is None
    assert clean_inline("x" * 500, max_length=10) == "x" * 10


def test_strip_accents_keeps_case() -> None:
    assert strip_accents("Estágio em AUTOMAÇÃO") == "Estagio em AUTOMACAO"
