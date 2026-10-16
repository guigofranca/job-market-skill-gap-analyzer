"""Split a job description into what is required, what is a plus, and what is not about the job.

Postings mix three kinds of text: requirements and responsibilities (what the job needs), "nice to
have" items ("Diferenciais", "Desejável", "...será um diferencial"), and boilerplate about the
company or its benefits ("Sobre a empresa", "Informações adicionais", "Somos uma empresa de IA").
Counting all of it as requirements inflates the numbers - the classic case is a company
describing itself as an AI company. The rules here are deliberately simple and transparent:

* headings switch the current section (a short line such as "Requisitos e qualificações");
* inside any job section, a clause that says "diferencial" / "desejável" / "plus" is a plus;
* text before the first heading counts as job content, except sentences describing the company;
* company / benefits sections are ignored entirely.

Detection runs on accent-free, lower-cased copies; the returned text keeps its original case (some
skill patterns, such as the R language, are case-sensitive).
"""

from __future__ import annotations

import re
from enum import StrEnum

from job_analyzer.processing.text import matching_form


class Part(StrEnum):
    INTRO = "intro"
    REQUIRED = "required"
    NICE = "nice"
    IGNORED = "ignored"


MAX_HEADING_CHARS = 90

# Gupy concatenates its fixed section titles with the text ("Requisitos e qualificaçõesEnsino..."):
# put them back on their own lines before splitting.
_INLINE_HEADINGS = re.compile(
    r"(responsabilidades e atribuicoes|requisitos e qualificacoes|informacoes adicionais"
    r"|etapas do processo)",
    re.IGNORECASE,
)

_HEADING_RULES: tuple[tuple[Part, re.Pattern[str]], ...] = (
    (
        Part.NICE,
        re.compile(
            r"^(?:requisitos |conhecimentos |qualificacoes )?(?:diferencia(?:l|is)|desejave(?:l|is)"
            r"|nice to have|bonus|pontos? extras?|e um plus|sera um plus|seria (?:otimo|legal)"
            r"|o que (?:vai|pode) te destacar|sera um diferencial)\b"
        ),
    ),
    (
        Part.IGNORED,
        re.compile(
            r"^(?:sobre (?:a|o|nos|nossa|nosso|a empresa|o time)\b|quem somos"
            r"|informacoes adicionais|(?:nossos )?beneficios|o que oferecemos|remuneracao"
            r"|etapas do processo"
            r"|nossa cultura|por que trabalhar|diversidade|local de trabalho|jornada|horario"
            r"|about us|benefits|perks)"
        ),
    ),
    (
        Part.REQUIRED,
        re.compile(
            r"^(?:requisitos|qualificacoes|o que (?:buscamos|esperamos|voce precisa|e necessario)"
            r"|perfil|conhecimentos|habilidades|competencias|responsabilidades|atribuicoes"
            r"|atividades|o que voce (?:vai|ira) fazer|desafios|requirements|responsibilities"
            r"|pre-?requisitos|formacao|se liga no que precisa)"
        ),
    ),
)
# A clause that marks its own content as a plus ("Power BI será um diferencial").
_NICE_CLAUSE = re.compile(
    r"\bdiferencia(?:l|is)\b|\bdesejave(?:l|is)\b|\bnice to have\b|\b(?:e|sera|seria) um plus\b"
    r"|\bbonus\b|\bsera considerad[oa]\b|\bseria otimo\b"
)
# Intro sentences describing the company rather than the job.
_COMPANY_SENTENCE = re.compile(
    r"\b(?:somos|nossa|nosso|nossos|nossas|fundad[oa]|lider|referencia|atuamos|missao"
    r"|proposito|startup|ecossistema|empresa de|empresa do|a empresa|grupo \w+)\b"
)
_CLAUSE_SPLIT = re.compile(r";|(?<=[.!?])\s+")
_HEADING_NOISE = re.compile(r"^[^a-z0-9]+")


def split_requirements(title: str, description: str) -> tuple[str, str]:
    """Return (required_text, nice_text) in matching form. The title is always required.

    `description` should keep its line breaks (`html_to_text(..., keep_lines=True)`).
    """
    text = _INLINE_HEADINGS.sub(r"\n\1\n", matching_form(description))
    required: list[str] = [matching_form(title)]
    nice: list[str] = []
    part = Part.INTRO

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        heading = _heading(line)
        if heading is not None:
            part, rest = heading
            if not rest:
                continue
            line = rest  # "Diferenciais: Python, SQL" -> the content after the colon
        for clause in _CLAUSE_SPLIT.split(line):
            target = _classify(part, clause.lower())
            if target is Part.NICE:
                nice.append(clause)
            elif target is Part.REQUIRED:
                required.append(clause)

    return "\n".join(required), "\n".join(nice)


def _heading(line: str) -> tuple[Part, str] | None:
    """(section, remaining text) if `line` starts a section, else None."""
    label, _, rest = line.partition(":")
    candidate = _HEADING_NOISE.sub("", (label if rest else line).lower()).strip()
    if not candidate or len(candidate) > MAX_HEADING_CHARS:
        return None
    for part, pattern in _HEADING_RULES:
        if pattern.match(candidate):
            if rest:
                return part, rest.strip()
            # Without a colon, a long line is a sentence that merely starts like a heading.
            if len(line) > MAX_HEADING_CHARS / 2:
                return None
            # A short line both switches the section and may carry content of its own
            # ("Será um diferencial ter Python"); a bare title ("Requisitos") carries no skills.
            return part, line
    return None


def _classify(part: Part, clause: str) -> Part:
    if part is Part.IGNORED:
        return Part.IGNORED
    if part is Part.NICE or _NICE_CLAUSE.search(clause):
        return Part.NICE
    if part is Part.INTRO and _COMPANY_SENTENCE.search(clause):
        return Part.IGNORED
    return Part.REQUIRED
