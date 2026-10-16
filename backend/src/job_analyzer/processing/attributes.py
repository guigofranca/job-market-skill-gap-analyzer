"""What job seekers filter by besides skills: workplace, contract type and inclusion.

Sources deliver most of this as structured fields (see `sources/`); the rules here only fill the
gaps, and conservatively. Titles are trusted. Descriptions count only with explicit wording ("vaga
exclusiva para..."), because "incentivamos candidaturas de mulheres e pessoas negras" is a diversity
statement, not an affirmative-action posting. All patterns run on accent-free text.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

from job_analyzer.models import Affirmative, Contract, Level, Workplace

_I = re.IGNORECASE

# Hybrid first: "Remoto ou Híbrido" still requires going to the office sometimes.
WORKPLACE_PATTERNS: tuple[tuple[Workplace, re.Pattern[str]], ...] = (
    (Workplace.HIBRIDO, re.compile(r"\bhibrid[oa]\b|\bhybrid\b", _I)),
    (Workplace.REMOTO, re.compile(r"\bremot[oa]\b|\bremote\b|\bhome[\s-]?office\b", _I)),
    (Workplace.PRESENCIAL, re.compile(r"\bpresencial\b|\bon[\s-]?site\b", _I)),
)

CONTRACT_PATTERNS: tuple[tuple[Contract, re.Pattern[str]], ...] = (
    (Contract.CLT, re.compile(r"\bclt\b", _I)),
    (Contract.PJ, re.compile(r"\bpj\b|\bpessoa juridica\b", _I)),
)

_AGE = r"(?:40|45|50|60)"
GROUP_PATTERNS: dict[Affirmative, str] = {
    Affirmative.PCD: r"pcds?\b|pessoas? com deficiencia",
    Affirmative.MULHERES: r"mulher(?:es)?\b|women\b",
    Affirmative.PESSOAS_NEGRAS: r"pessoas? (?:negras?|pretas?|pardas?|nao brancas?)\b|negr[oa]s\b",
    Affirmative.INDIGENAS: r"(?:pessoas? )?indigenas?\b|pessoas? nao brancas?\b",
    Affirmative.LGBTQIA: r"(?:pessoas? )?lgbt\w*",
    Affirmative.PESSOAS_40_MAIS: (
        rf"(?:pessoas? )?(?:com )?(?:\+ ?{_AGE}|{_AGE} ?\+|mais de {_AGE} anos|{_AGE} anos ou mais)"
    ),
}
# A title must place the group after an affirmative marker ("Afirmativa para Mulheres"), so that
# "Hospital da Mulher" does not count. PcD is the exception: "Assistente PcD" is an exclusive role.
_MARKER = r"(?:afirmativ\w*|exclusiv\w*|preferencialmente|prioritariamente|\bpara\b)"
TITLE_AFFIRMATIVE: dict[Affirmative, re.Pattern[str]] = {
    group: re.compile(
        rf"(?<!\w)(?:{pattern})"
        if group is Affirmative.PCD
        else rf"{_MARKER}[^|()\-]{{0,40}}?(?<!\w)(?:{pattern})",
        _I,
    )
    for group, pattern in GROUP_PATTERNS.items()
}
DESCRIPTION_AFFIRMATIVE: dict[Affirmative, re.Pattern[str]] = {
    group: re.compile(
        r"\b(?:vaga|oportunidade|processo seletivo) (?:e )?(?:afirmativ\w*|exclusiv\w*)"
        rf"[^.\n]{{0,60}}?(?<!\w)(?:{pattern})",
        _I,
    )
    for group, pattern in GROUP_PATTERNS.items()
}
# "Inclusivo para PcD", "vaga também para PcD": open to everyone, PcD candidates welcome.
PCD_FRIENDLY = re.compile(
    r"\b(?:inclusiv\w*|tambem|aberta|abertas|extensiv\w*) (?:a|para) "
    r"(?:pcds?|pessoas com deficiencia)",
    _I,
)


def detect_workplace(*texts: object) -> Workplace | None:
    """First workplace stated in the given texts (pass the most reliable one first). Missing
    values (None, or NaN from a DataFrame column) are skipped."""
    for text in texts:
        if not isinstance(text, str) or not text:
            continue
        for workplace, pattern in WORKPLACE_PATTERNS:
            if pattern.search(text):
                return workplace
    return None


def detect_contracts(text: str) -> list[Contract]:
    return [contract for contract, pattern in CONTRACT_PATTERNS if pattern.search(text)]


def detect_affirmative(title: str, description: str) -> set[Affirmative]:
    """Affirmative groups stated in the title, or explicitly in the description."""
    found = {
        group for group, pattern in DESCRIPTION_AFFIRMATIVE.items() if pattern.search(description)
    }
    inclusive_title = bool(PCD_FRIENDLY.search(title))
    for group, pattern in TITLE_AFFIRMATIVE.items():
        if group is Affirmative.PCD and inclusive_title:
            continue  # "inclusivo para PcD" welcomes PcD candidates but is not reserved for them
        if pattern.search(title):
            found.add(group)
    return found


def is_pcd_friendly(text: str) -> bool:
    return bool(PCD_FRIENDLY.search(text))


def resolve_contracts(
    source: Iterable[Contract], text: str, level: Level | str | None
) -> list[Contract]:
    """Source data wins; otherwise the text; an internship with no stated contract is "estágio"."""
    contracts = list(dict.fromkeys(source)) or detect_contracts(text)
    if not contracts and level == Level.ESTAGIO:
        contracts = [Contract.ESTAGIO]
    return contracts


def ordered(groups: Iterable[Affirmative]) -> list[Affirmative]:
    """Declaration order, so the same job always serialises the same way."""
    wanted = set(groups)
    return [group for group in Affirmative if group in wanted]
