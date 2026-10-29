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
from job_analyzer.processing.skills import CATEGORY_AREA_HINTS, SKILLS_BY_SLUG, SkillCategory
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
# Brazilian entry-level titles that never say "júnior": assistente, auxiliar and técnico as the
# role itself ("Assistente de TI", not "Analista de Suporte Técnico") and first-tier support.
ENTRY_ROLE_TITLE = re.compile(
    r"(?:^|[-|:/(\[\]\u2013\u2014])\s*(?:assistente|auxiliar|tecnic[oa])\b"
    r"|\bn1\b|\bnivel (?:1|i)\b",
    _I,
)
# Level I of a career ladder ("Analista de Dados I"). Upper case only, and II/III do not count.
LADDER_LEVEL_ONE = re.compile(r"(?<![.\w])I(?![.\w])")
# Higher rungs keep those roles out: "Técnico Suporte II", "Técnico de Suporte - Nível 2".
HIGHER_LADDER = re.compile(
    r"(?<![.\w])(?:II|III|IV)(?![.\w])|\bn[23]\b|\b[23]n\b|\bnivel [23]\b|\b[23]o nivel\b"
    r"|\bespecializad[oa]\b",
    _I,
)
# "T.I" and "T.I." are written for TI; the rules below expect the plain form.
DOTTED_TI = re.compile(r"\bT\.\s?I\b\.?", _I)

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
            r"\bdados\b|\bdata\b|\bbi\b|\bbusiness intelligence\b|\banalytics\b|\bmis\b"
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
            r"|de informatica|em informatica|de infraestrutura|(?:de |em )?redes\b(?! sociais)"
            r"|n[123]\b|nivel [123])"
            r"|\bsuporte\b.*\b(?:ti|tecnologia|informatica|sistemas)\b"
            r"|\b(?:ti|tecnologia|informatica)\b.*\b(?:suporte|infra(?:estrutura)?)\b"
            r"|\bhelp ?desk\b|\bservice ?desk\b|\bnoc\b|\bsysadmin\b"
            r"|\badministrador(?:a)? de (?:redes|sistemas)\b|\bfield service de ti\b"
            r"|\binfra(?:estrutura)? (?:(?:de|e|em) )?(?:ti|tecnologia|redes?|cloud|suporte)\b"
            # A bare "Assistente de Infraestrutura" may be building maintenance: skills decide.
            r"|\b(?:analista|estagio|estagiari[oa])(?:\(a\))?\s*(?:de |em )?infra(?:estrutura)?\b"
            r"|\btecnic[oa] (?:de |em )?(?:ti|informatica|suporte|redes\b(?! sociais))\b"
            r"|\bmanutencao de (?:equipamentos de ti|computadores|micros)\b"
            r"|\bopera(?:cao|coes) (?:de |em )?ti\b|\bti\b.*\bopera(?:cao|coes)\b"
            r"|\bredes de computadores\b"
            r"|\b(?:analista|estagio|estagiari[oa]) (?:de |em )?redes\b(?! sociais)"
            r"|\bmonitoramento de redes\b"
            r"|\bseguranca (?:(?:da |de )?informacao|de ti|em ti|cibernetica)\b|\bciberseguranca\b"
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
            r"|\banalista (?:de )?sistemas\b|\banalise (?:e desenvolvimento )?de sistemas\b"
            r"|\bsistemas de informacao\b"
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
    # The same field as a degree, a technician or plant maintenance ("Elétrica/Automação").
    r"|\bengenharia (?:de )?automacao\b|\beletric[ao]\s*/\s*automacao\b"
    r"|\btecnic[oa](?:\(a\))? (?:de |em )?automacao\b(?! de (?:testes?|processos)\b)"
    r"|\bmanutencao(?: \w+)? e automacao\b"
    # Production / maintenance planners and CNC operators ("Programador de Produção (PCP)").
    r"|\bprogramador(?:a|\(a\))? (?:de )?(?:producao|manutencao|materiais|cnc)\b|\bpcp\b"
    # Field installation work ("Instalador-reparador de linhas de comunicação de dados").
    r"|\binstalador\w*|\breparador\w*|\bfibra optica\b|\bseguranca eletronica\b"
    # Procurement of IT ("Comprador(a) Júnior - TI") and customer-facing support.
    r"|\bcomprador\w*|\bestagio (?:em |de )?compras\b|\bsucesso do cliente\b"
    r"|\bsuporte (?:(?:ao|a|de) )?(?:cliente|paciente|qualidade|vendas|comercial)\b|\brelacional\b"
    r"|\b(?:assistente|auxiliar|operador(?:a)?)(?:\(a\))? de atendimento\b|\bcac\b"
    # Office roles that sit in an IT department or mention data ("Assistente Administrativo - TI").
    r"|\b(?:assistente|auxiliar)(?:\(a\))? (?:administrativ[oa]|de marketing)\b"
    r"|\bprocessamento de dados\b|\baudit\w*|\bfiscal\b|\bcontabil\b",
    _I,
)
# Decided by the skills the posting asks for ("Analista de Suporte" may be IT or customer care).
GENERIC_TECH_TITLE = re.compile(
    r"\bsuporte\b|\bti\b|\bit\b|\btecnologia\b|\btech\b|\binformatica\b|\bcomputacao\b|\bsistemas\b"
    r"|\b(?:assistente|auxiliar|tecnic[oa])(?:\(a\))?\s*(?:de |em )?infra(?:estrutura)?\b"
    r"|\bengenharia de software\b|\bciencia da computacao\b",
    _I,
)
MIN_SKILLS_FOR_FALLBACK = 2
INDUSTRIAL_SKILL = "plc"
SOFTWARE_AUTOMATION_SKILLS = frozenset(
    slug
    for slug, skill in SKILLS_BY_SLUG.items()
    if skill.category is SkillCategory.AUTOMACAO_QA and slug != INDUSTRIAL_SKILL
)
# A generic IT role ("Estágio em TI", "Assistente de TI") whose skills point nowhere is support
# and infrastructure, the usual first job in IT. Only filler words may sit between role and
# field: "Analista de Negócios TI" and "Analista Governança TI" are other jobs.
IT_ROLE_TITLE = re.compile(
    r"\b(?:estagi\w*|analista|assistente|auxiliar|tecnic[oa]|trainee)\b"
    r"(?:\W+(?:a|o|de|em|da|do|na|no|nivel|universitario|superior|nao|obrigatorio))*\W+"
    r"(?:ti|tecnologia da informacao|informatica)\b",
    _I,
)


def _title_form(title: str) -> str:
    # "Suporte ao Cliente_Curitiba": an underscore would glue the words together for \b.
    return DOTTED_TI.sub("TI", matching_form(title).replace("_", " "))


def classify_level(title: str, hints: Sequence[str] = ()) -> Level | None:
    """Estágio wins over Júnior ("Estágio - Trainee"); explicit senior titles are out of scope.
    Entry-level roles ("Assistente de TI", "Analista de Dados I") count as Júnior unless the
    source says the posting is an internship."""
    normalized = _title_form(title)
    if INTERNSHIP_TITLE.search(normalized):
        return Level.ESTAGIO
    if JUNIOR_TITLE.search(normalized):
        return Level.JUNIOR
    if SENIOR_TITLE.search(normalized):
        return None
    return _level_from_hints(hints) or _entry_level(normalized)


def _level_from_hints(hints: Sequence[str]) -> Level | None:
    normalized_hints = [matching_form(hint).replace("_", " ") for hint in hints]
    if any(INTERNSHIP_HINT.search(hint) for hint in normalized_hints):
        return Level.ESTAGIO
    if any(JUNIOR_HINT.search(hint) for hint in normalized_hints):
        return Level.JUNIOR
    return None


def _entry_level(normalized: str) -> Level | None:
    if HIGHER_LADDER.search(normalized):
        return None
    if ENTRY_ROLE_TITLE.search(normalized) or LADDER_LEVEL_ONE.search(normalized):
        return Level.JUNIOR
    return None


def classify_area(title: str, skills: Sequence[str] = ()) -> Area | None:
    normalized = _title_form(title)
    if AREA_EXCLUSIONS.search(normalized):
        return None
    for area, pattern in AREA_TITLE_RULES:
        if pattern.search(normalized):
            if area is Area.AUTOMACAO and _is_industrial(skills):
                return None
            return area
    if GENERIC_TECH_TITLE.search(normalized):
        from_skills = _area_from_skills(skills)
        if from_skills is None and IT_ROLE_TITLE.search(normalized):
            return Area.INFRAESTRUTURA
        return from_skills
    return None


def _is_industrial(skills: Sequence[str]) -> bool:
    """A bare "Automação" title asking for PLCs and no software automation tool is a plant job."""
    return INDUSTRIAL_SKILL in skills and not SOFTWARE_AUTOMATION_SKILLS.intersection(skills)


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
