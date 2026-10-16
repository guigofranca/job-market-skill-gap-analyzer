"""Benefits a posting offers, as tags ("Vale-refeição", "Plano de saúde", "Gympass"...).

Tags are facts derived from the text, like the skills: the job list shows them, never the
posting's own sentences (the full text stays on the original posting). The rules are simple and
transparent, like sections.py:

* the text is cut into items: lines, bullets, semicolons, sentences - and the boundaries Gupy
  loses when it strips line breaks ("Vale RefeiçãoPlano de saúde", "para o novoManter");
* a short item that names a section ("Benefícios", "O que oferecemos", "Requisitos e
  qualificações") switches the current section;
* items of a benefits section are read, and so are items of the intro and of "Informações
  adicionais" that mention a benefit; requirements, responsibilities and company text are not
  (a health-insurance company's job is not a health-insurance benefit);
* each item is matched against one pattern per benefit.
"""

from __future__ import annotations

import re
from enum import StrEnum

from job_analyzer.models import Benefit
from job_analyzer.processing.text import matching_form

MIN_ITEM_CHARS = 2  # "VT", "VR"
MAX_HEADING_CHARS = 60
MAX_LABEL_CHARS = 40


class Section(StrEnum):
    INTRO = "intro"
    REQUIRED = "required"
    NICE = "nice"
    BENEFITS = "benefits"
    ADDITIONAL = "additional"
    OTHER = "other"


# Matched against accent-free, lower-cased headings without leading symbols.
_HEADINGS: tuple[tuple[Section, re.Pattern[str]], ...] = (
    (
        Section.NICE,
        re.compile(
            r"^(?:requisitos |conhecimentos |qualificacoes )?(?:diferencia(?:l|is)|desejave(?:l|is)"
            r"|nice to have|pontos? extras?|sera um plus|seria (?:otimo|legal)"
            r"|o que (?:vai|pode) te destacar|sera (?:considerad[oa] )?um diferencial)\b"
        ),
    ),
    (
        Section.BENEFITS,
        re.compile(
            r"^(?:(?:nossos |os |principais )?beneficios"
            r"|o que (?:oferecemos|temos para|voce (?:vai|ira) (?:ter|receber|encontrar))"
            r"|oferecemos|vantagens|remuneracao(?: e beneficios)?"
            r"|pacote de beneficios|benefits|perks)\b"
        ),
    ),
    (Section.ADDITIONAL, re.compile(r"^informacoes adicionais\b")),
    (
        Section.REQUIRED,
        re.compile(
            r"^(?:requisitos|qualificacoes|o que (?:buscamos|esperamos|voce precisa|e necessario"
            r"|precisamos)|perfil|conhecimentos|habilidades|competencias|pre-?requisitos|formacao"
            r"|se liga no que precisa|quem (?:procuramos|buscamos)|para se candidatar|requirements)"
        ),
    ),
    (
        Section.OTHER,
        re.compile(
            r"^(?:responsabilidades|atribuicoes|atividades|o que voce (?:vai|ira) fazer|desafios"
            r"|descricao da vaga|sobre (?:a|o|nos|nossa|nosso)\b|quem somos|etapas do processo"
            r"|nossa cultura|por que trabalhar|diversidade|responsibilities|about us|como vai ser"
            r"|modelo de trabalho|regime de contratacao|regiao de contratacao|local\b|localizacao)"
        ),
    ),
)

# Gupy glues its fixed section titles to the text: put them on their own lines first.
_GUPY_HEADINGS = re.compile(
    r"(Descrição da vaga|Responsabilidades e atribuições|Requisitos e qualificações"
    r"|Informações adicionais|Etapas do processo)"
)
# Bullets, semicolons, emojis used as bullets ("refeições🏥 Plano de Saúde"), and dashes that
# start an item after a sentence.
_BULLETS = re.compile(
    "\\s*(?:[\u2022\u25cf\u25aa\u25e6\u25b8\u25ba\u2713\u2714\u27a4\u27a2\u2192\u00b7;]"
    "|[\U0001f300-\U0001faff\u2600-\u27bf][\ufe0f\u200d\u2640\u2642]*)\\s*"
    "|(?<=[.!?:])\\s*[-\u2013\u2014]\\s+"
)
# A sentence end, or punctuation glued to the next item ("básicas).Linguagem") - but not ".NET".
_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-ZÀ-Ú0-9])|(?<=[^\s.][.!?:)])(?=[A-ZÀ-Ú])(?!NET\b)")
# "para o novoManter", "PLRPrevidência", "Home OfficePLR": a word that runs into the next one.
_GLUED = re.compile(
    r"(?<=[a-zà-ÿ])(?=[A-ZÀ-Ú][a-zà-ÿ])|(?<=[A-ZÀ-Ú]{3})(?=[A-ZÀ-Ú][a-zà-ÿ]{2})"
    r"|(?<=[a-zà-ÿ]{3})(?=[A-ZÀ-Ú]{2,}(?![a-zà-ÿ]))"
    r"|(?<=[a-zà-ÿ]{2})(?=[A-ZÀ-Ú]$)"  # "6h/diaO que oferecemos"
)
# "R$ 1.700,00Vale Lanche"
_GLUED_NUMBER = re.compile(r"(?<=\d)(?=[A-ZÀ-Ú][a-zà-ÿ]{2})")
_WORD = re.compile(r"[A-Za-zÀ-ÿ]+")
# Mixed-case names that are one word, not two glued together.
_ONE_WORD_NAMES = """
JavaScript TypeScript PowerPoint PowerShell PowerApps PowerQuery PowerPivot PowerAutomate PowerBI
GitHub GitLab GitOps LinkedIn DevOps DevSecOps DataOps FinOps MLOps LLMOps AIOps SecOps CloudOps
BigQuery WordPress SharePoint OneDrive YouTube iFood iPhone iPad macOS HubSpot QuickSight
CloudFormation CloudWatch NodeJS ReactJS NextJS VueJS AngularJS NestJS ExpressJS ElasticSearch
DataBricks DataDog SolidWorks InDesign CorelDraw TotalPass GymPass WellHub PicPay PagBank PagSeguro
QlikView QlikSense LibreOffice OpenShift AppSheet TensorFlow PyTorch NumPy SciPy PySpark PyTest
SpringBoot CakePHP CodeIgniter IntelliJ PhpStorm WebStorm DBeaver WebSocket WhatsApp UiPath
SQLAlchemy FastAPI MongoDB PostgreSQL MySQL NoSQL GraphQL RabbitMQ DynamoDB CosmosDB InfluxDB
TypeORM JavaEE OutSystems ServiceNow SalesForce ZenDesk JetBrains NetSuite ChatGPT OpenAI
SulAmérica SulAmerica BairesDev UniFi CrowdStrike SentinelOne FortiGate SaaS PaaS IaaS DBaaS
"""
_ONE_WORD = frozenset(_ONE_WORD_NAMES.casefold().split())
# A lead-in that ends with a colon ("Como Analista Jr. você será responsável por:") names the
# section by its words, wherever they are.
_LEAD_INS: tuple[tuple[Section, re.Pattern[str]], ...] = (
    (
        Section.OTHER,
        re.compile(r"responsav|responsabilidade|atividades|atribuic|dia a dia|vai fazer"),
    ),
    (Section.BENEFITS, re.compile(r"beneficio|oferecemos|vantage")),
    (Section.NICE, re.compile(r"diferencia|desejave|\bplus\b")),
    (
        Section.REQUIRED,
        re.compile(r"requisito|esperamos|buscamos|procuramos|precisa|possu|qualificac|perfil"),
    ),
)
MAX_LEAD_IN_CHARS = 140
# "Dr. C&A - Telemedicina": not the end of a sentence.
_ABBREVIATION = re.compile(r"^(?:Dr|Dra|Sr|Sra|Jr|Prof|Profa|Ltda|Av|Ex|Obs)\.$")
_LEADING_NOISE = re.compile(r"^[^\wÀ-ÿ(\"'“]+")
# Benefits, pay and hours: what is kept from the intro and "Informações adicionais".
_CONDITIONS = re.compile(
    r"\b(?:beneficios?|vale[- ](?:refeicao|alimentacao|transporte)|v[rat]\b|plano (?:de )?saude"
    r"|plano odontologico|assistencia (?:medica|odontologica)|convenio|seguro de vida|gympass"
    r"|wellhub|totalpass|auxilio|bolsa|remuneracao|salario|r\$|day[- ]?off|plr|participacao nos"
    r" lucros|ferias|recesso|jornada(?: de trabalho)?\s*(?::|de \d|\d)|carga horaria"
    r"|horario(?: de trabalho)?\s*(?::|das? \d|\d|flexivel)"
    r"|\d+ ?h(?:oras)?(?: semanais|/dia|/semana| por dia| diarias)?\b"
    r"|home office|ajuda de custo|gratificacao|13o)"
)


# Benefit sections drift into company prose and hiring notices: a long item has to name a benefit,
# and these never are one.
MAX_PLAIN_BENEFIT_CHARS = 80
_NOT_A_BENEFIT = re.compile(
    r"processo seletivo|nao cobra|canais oficiais|candidat|diversidade|inclusao|curtiu|venha"
    r"|junte-se|faca parte|https?://|^e muito mais"
)


# One pattern per benefit, on accent-free lower-cased items.
_BENEFITS: tuple[tuple[Benefit, re.Pattern[str]], ...] = (
    (
        Benefit.VALE_REFEICAO,
        re.compile(
            r"\bv\.?[ra]\b|vale[- ]?(?:refeicao|alimentacao|lanche)|ticket|alelo|sodexo|\bflash\b"
            r"|\bcaju\b|swile|(?:beneficio|cartao) (?:refeicao|alimentacao|flexivel)|refeicao flex"
            r"|auxilio[- ](?:refeicao|alimentacao)|alimentacao flex"
        ),
    ),
    (
        Benefit.REFEICAO_LOCAL,
        re.compile(
            r"refeitorio|restaurante (?:interno|na empresa|no local)"
            r"|refeicao (?:no local|na empresa|completa)"
            r"|almoco (?:no local|na empresa|fornecido|gratuito)|cafe da manha"
        ),
    ),
    (
        Benefit.VALE_TRANSPORTE,
        re.compile(
            r"\bv\.?t\b|vale[- ]?transporte|auxilio[- ](?:transporte|mobilidade|combustivel)"
            r"|fretado|estacionamento"
        ),
    ),
    (
        Benefit.PLANO_SAUDE,
        re.compile(
            r"plano (?:de )?saude|assistencia medica|convenio medico|seguro saude|plano medico"
            r"|telemedicina"
        ),
    ),
    (Benefit.ODONTOLOGICO, re.compile(r"odonto|dental")),
    (Benefit.SEGURO_VIDA, re.compile(r"seguro de vida")),
    (Benefit.ACADEMIA, re.compile(r"gympass|wellhub|total ?pass|academia")),
    (
        Benefit.PLR,
        re.compile(
            r"\bplr\b|participacao nos (?:lucros|resultados)|\bbonus\b|bonificacao|14o salario"
        ),
    ),
    (
        Benefit.EDUCACAO,
        re.compile(
            r"auxilio[- ](?:educacao|estudo|idiomas?)|bolsas? de estudos?|reembolso (?:de |em )?"
            r"(?:cursos?|educacao|graduacao|pos)|subsidio (?:educacional|de estudo)"
            r"|desconto(?:s)? (?:em|com) (?:faculdade|cursos|instituic|escolas)"
            r"|parcerias? com (?:faculdade|instituic|escolas)|idiomas|alura|udemy"
            r"|universidade corporativa|plataforma de (?:cursos|aprendizagem)"
        ),
    ),
    (
        Benefit.HOME_OFFICE,
        re.compile(
            r"(?:auxilio|ajuda de custo|subsidio)[- ](?:para (?:o )?)?home ?office|kit home office"
        ),
    ),
    (Benefit.DAY_OFF, re.compile(r"day[- ]?off|folga no (?:dia|mes) do (?:seu )?aniversario")),
    (
        Benefit.HORARIO_FLEXIVEL,
        re.compile(r"horario flexivel|jornada flexivel|flexibilidade de horario"),
    ),
    (Benefit.CRECHE, re.compile(r"creche")),
    (Benefit.PREVIDENCIA, re.compile(r"previdencia privada")),
    (
        Benefit.SAUDE_MENTAL,
        re.compile(r"(?:apoio|suporte) psicologico|terapia|saude mental|zenklub|psicolog"),
    ),
)


def extract_benefits(description: str) -> list[Benefit]:
    """`description` keeps its line breaks (`html_to_text(..., keep_lines=True)`)."""
    found: set[Benefit] = set()
    section = Section.INTRO
    for piece in _items(description):
        item = piece
        heading = _heading(piece)
        if heading is not None:
            kind, rest = heading
            if rest and kind is Section.OTHER:
                continue  # "Modelo de trabalho: Híbrido" is a detail, not a new section
            section, item = kind, rest
            if not item:
                continue
        if not item.endswith(":") and _offers(section, item):
            form = matching_form(item).lower()
            found.update(benefit for benefit, pattern in _BENEFITS if pattern.search(form))
    return [benefit for benefit in Benefit if benefit in found]


def _items(description: str) -> list[str]:
    text = _GUPY_HEADINGS.sub(r"\n\1\n", description)
    items: list[str] = []
    pending = ""
    for line in text.splitlines():
        for part in _BULLETS.split(line):
            for sentence in _SENTENCE.split(_unglue(part)):
                for piece in sentence.split("\n"):
                    cleaned = _LEADING_NOISE.sub("", piece).strip()
                    if _ABBREVIATION.match(cleaned):
                        pending = f"{pending}{cleaned} "
                        continue
                    cleaned, pending = pending + cleaned, ""
                    if len(cleaned) >= MIN_ITEM_CHARS:
                        items.append(cleaned)
    return items


def _unglue(text: str) -> str:
    """Break glued words with a newline, unless the word is a known mixed-case name."""

    def split(match: re.Match[str]) -> str:
        parts = _GLUED.split(match.group(0))
        # Put back the known names among the pieces ("Creche|Well|Hub" -> "Creche|WellHub").
        words: list[str] = []
        for part in parts:
            if words and (words[-1] + part).casefold() in _ONE_WORD:
                words[-1] += part
            elif len(words) > 1 and (words[-2] + words[-1] + part).casefold() in _ONE_WORD:
                words[-2:] = [words[-2] + words[-1] + part]
            else:
                words.append(part)
        return "\n".join(words)

    return _GLUED_NUMBER.sub("\n", _WORD.sub(split, text))


def _heading(item: str) -> tuple[Section, str] | None:
    """(section, remaining text) if `item` names a section, else None."""
    label, colon, rest = item.partition(":")
    label = label.strip()
    if colon and not rest.strip() and len(label) <= MAX_LEAD_IN_CHARS:
        lead_in = matching_form(label).lower()
        for section, pattern in _LEAD_INS:
            if pattern.search(lead_in):
                return section, ""
    if colon and rest.strip() and len(label) > MAX_LABEL_CHARS:
        return None
    candidate = _LEADING_NOISE.sub("", matching_form(label if colon else item).lower()).strip()
    candidate = candidate.rstrip("?!. ")
    if not candidate or len(candidate) > MAX_HEADING_CHARS:
        return None
    for section, pattern in _HEADINGS:
        if pattern.match(candidate):
            if colon:
                return section, rest.strip()
            # A heading names the section and nothing else: "Benefícios flexíveis por meio de
            # cartão Flash" is an item that merely starts like one.
            return (section, "") if len(candidate.split()) <= 6 else None
    return None


def _offers(section: Section, item: str) -> bool:
    """Whether an item speaks of what the job offers."""
    form = matching_form(item).lower()
    if section is Section.BENEFITS:
        if _NOT_A_BENEFIT.search(form):
            return False
        return len(item) <= MAX_PLAIN_BENEFIT_CHARS or bool(_CONDITIONS.search(form))
    return section in (Section.INTRO, Section.ADDITIONAL) and bool(_CONDITIONS.search(form))
