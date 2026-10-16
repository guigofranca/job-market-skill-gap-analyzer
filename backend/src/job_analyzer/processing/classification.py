"""Rule-based classification of seniority level and area.

Titles are the primary signal (they are short and written to be explicit). Source hints such as
Gupy's `vacancy_type_internship` or the seniority tags of Sólides are used when the
title is silent. Titles come in Portuguese or English (Brazilian tech companies use both).
All patterns run on accent-free text, so "Estágio", "Estagio" and "ESTÁGIO" behave the same.
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Sequence

from job_analyzer.models import Area, Level
from job_analyzer.processing.skills import CATEGORY_AREA_HINTS, SKILLS_BY_SLUG
from job_analyzer.processing.text import matching_form

_I = re.IGNORECASE

INTERNSHIP_TITLE = re.compile(
    r"\bestagi\w*|\bintern(?:ship)?s?\b|\bworking student\b",
    _I,
)
JUNIOR_TITLE = re.compile(
    r"\bjunior\b|\bjr\b|\bentry[\s-]level\b|\btrainee\b"
    r"|\bgraduate (?:program|programme|developer|engineer|analyst)\b",
    _I,
)
# Above entry level, or a different track altogether (apprenticeships are not internships).
SENIOR_TITLE = re.compile(
    r"\bsenior\b|\bsr\b|\bpleno\b|\bpl\b|\bmid[\s-]?level\b|\blead\b|\blider\b|\bprincipal\b"
    r"|\bstaff\b|\bhead\b|\bmanager\b|\bgerente\b|\bcoordenador(?:a)?\b|\bespecialista\b"
    r"|\bspecialist\b|\baprendiz\b|\bapprentice\b",
    _I,
)
INTERNSHIP_HINT = re.compile(r"\bestagi\w*|internship|\bintern\b|working student|^student$", _I)
JUNIOR_HINT = re.compile(r"\bentry\b|\bjunior\b|\bjr\b|trainee", _I)

# Ordered from most to least specific: "Desenvolvedor RPA" is automation, "Dev BI" is data.
AREA_TITLE_RULES: tuple[tuple[Area, re.Pattern[str]], ...] = (
    (
        Area.AUTOMACAO,
        re.compile(
            r"\bautomac(?:ao|oes)\b|\bhiperautomacao\b|\bautomation\b|\brpa\b"
            r"|\bqa\b|\bquality assurance\b|\bqualidade de software\b|\btestes?\b|\btester\b"
            r"|\btest(?:ing)? engineer\b|\bsdet\b|\bdevops\b|\bsre\b",
            _I,
        ),
    ),
    (
        Area.DADOS,
        re.compile(
            r"\bdados\b|\bdata\b|\bbi\b|\bbusiness intelligence\b|\banalytics\b"
            r"|\bcientista\b|\bciencia de dados\b|\bmachine learning\b|\bestatistic[ao]\b"
            r"|\bbig data\b|\bpower bi\b|\betl\b|\binteligencia artificial\b|\bia\b"
            # A bare "AI" is too broad in English titles ("AI startup"); require a role noun.
            r"|\b(?:ai|ml) (?:engineer|developer|specialist|analyst|research)",
            _I,
        ),
    ),
    (
        # Support, infrastructure, networks and security: the classic first job in IT.
        Area.INFRAESTRUTURA,
        re.compile(
            r"\bsuporte (?:tecnico|de ti|em ti|ti\b|a ti|de sistemas|a sistemas|ao usuario"
            r"|de informatica|em informatica|de infraestrutura|de redes|n[123]\b|nivel [123])"
            r"|\bsuporte\b.*\b(?:ti|tecnologia|informatica|sistemas)\b"
            r"|\b(?:ti|tecnologia|informatica)\b.*\b(?:suporte|infra(?:estrutura)?)\b"
            r"|\bhelp ?desk\b|\bservice ?desk\b|\bnoc\b|\bsysadmin\b"
            r"|\badministrador(?:a)? de (?:redes|sistemas)\b|\bfield service de ti\b"
            r"|\binfra(?:estrutura)? (?:de )?(?:ti|tecnologia|redes|cloud)\b"
            r"|\b(?:analista|tecnic[oa]|estagio|estagiari[oa]|assistente|auxiliar)(?:\(a\))?\s*"
            r"(?:de |em )?infra(?:estrutura)?\b"
            r"|\btecnic[oa] (?:de |em )?(?:ti|informatica|suporte|redes\b(?! sociais))\b"
            r"|\bmanutencao de (?:equipamentos de ti|computadores|micros)\b"
            r"|\bopera(?:cao|coes) (?:de |em )?ti\b|\bti\b.*\bopera(?:cao|coes)\b"
            r"|\bredes de computadores\b"
            r"|\b(?:analista|estagio|estagiari[oa]) (?:de |em )?redes\b(?! sociais)"
            r"|\bmonitoramento de redes\b"
            r"|\bseguranca (?:da informacao|de ti|em ti|cibernetica)\b|\bciberseguranca\b"
            r"|\bcyber ?seguranca\b|\bcyber ?security\b|\bpentest\w*|\bsoc analyst\b"
            r"|\bti cloud\b|\banalista (?:de )?cloud\b|\bcloud (?:analyst|engineer)\b",
            _I,
        ),
    ),
    (
        Area.DESENVOLVIMENTO,
        re.compile(
            r"\bdesenvolvedor(?:a|es)?\b|\bdev\b|\bdeveloper\b|\bprogramador(?:a)?\b|\bsoftware\b"
            r"|\bfront[\s-]?end\b|\bback[\s-]?end\b|\bfull[\s-]?stack\b|\bmobile\b|\bandroid\b"
            r"|\bios\b|\bweb\b|\bprogrammer\b"
            r"|\banalista de sistemas\b|\bsistemas de informacao\b"
            r"|\bdesenvolvimento (?:de )?(?:software|sistemas|web|aplicacoes|aplicativos)\b",
            _I,
        ),
    ),
)
# Titles that look like data/automation but are not tech roles.
AREA_EXCLUSIONS = re.compile(
    r"\bprotecao de dados\b|\bprivacidade\b|\blgpd\b|\bentrada de dados\b|\bdigitacao\b"
    r"|\bdata entry\b|\bdevelopment representative\b|\bbusiness development\b"
    # Sales roles that merely sell software ("Gerente de Negócios Júnior (Software)").
    r"|\bgerente de (?:negocios|contas)\b|\bexecutiv[oa] de (?:contas|vendas)\b|\bvendedor(?:a)?\b"
    r"|\bpre[\s-]?vendas\b|\baccount (?:manager|executive)\b"
    # Industrial automation (PLCs, mechatronics) is engineering, not software automation.
    r"|\bmecatronica\b|\bautomacao industrial\b|\bcontrole e automacao\b|\beletrotecnic\w*"
    # Field installation work ("Instalador-reparador de linhas de comunicação de dados").
    r"|\binstalador\w*|\breparador\w*|\bfibra optica\b|\bseguranca eletronica\b"
    # Procurement of IT ("Comprador(a) Júnior - TI") and customer-facing support.
    r"|\bcomprador\w*|\bestagio (?:em |de )?compras\b|\bsucesso do cliente\b"
    r"|\bsuporte (?:ao|a|de) (?:cliente|paciente|qualidade|vendas)\b|\brelacional\b",
    _I,
)
# Decided by the skills the posting asks for ("Analista de Suporte" may be IT or customer care).
GENERIC_TECH_TITLE = re.compile(
    r"\bsuporte\b|\bti\b|\bit\b|\btecnologia\b|\btech\b|\binformatica\b|\bcomputacao\b|\bsistemas\b"
    r"|\bengenharia de software\b|\bciencia da computacao\b",
    _I,
)
MIN_SKILLS_FOR_FALLBACK = 2


def classify_level(title: str, hints: Sequence[str] = ()) -> Level | None:
    """Estágio wins over Júnior ("Estágio - Trainee"); explicit senior titles are out of scope."""
    normalized = matching_form(title)
    if INTERNSHIP_TITLE.search(normalized):
        return Level.ESTAGIO
    if JUNIOR_TITLE.search(normalized):
        return Level.JUNIOR
    if SENIOR_TITLE.search(normalized):
        return None

    normalized_hints = [matching_form(hint).replace("_", " ") for hint in hints]
    if any(INTERNSHIP_HINT.search(hint) for hint in normalized_hints):
        return Level.ESTAGIO
    if any(JUNIOR_HINT.search(hint) for hint in normalized_hints):
        return Level.JUNIOR
    return None


def classify_area(title: str, skills: Sequence[str] = ()) -> Area | None:
    normalized = matching_form(title)
    if AREA_EXCLUSIONS.search(normalized):
        return None
    for area, pattern in AREA_TITLE_RULES:
        if pattern.search(normalized):
            return area
    if GENERIC_TECH_TITLE.search(normalized):
        return _area_from_skills(skills)
    return None


def _area_from_skills(skills: Sequence[str]) -> Area | None:
    """For generic titles ("Estágio em TI"), vote by the categories of the skills requested."""
    votes = Counter(
        CATEGORY_AREA_HINTS[SKILLS_BY_SLUG[slug].category]
        for slug in skills
        if slug in SKILLS_BY_SLUG and SKILLS_BY_SLUG[slug].category in CATEGORY_AREA_HINTS
    )
    if not votes:
        return None
    (area, count), *rest = votes.most_common()
    if count < MIN_SKILLS_FOR_FALLBACK or (rest and rest[0][1] == count):
        return None
    return area
