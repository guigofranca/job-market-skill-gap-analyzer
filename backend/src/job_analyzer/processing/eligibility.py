"""Who can apply: course, degree status, semester, graduation date, English and weekly hours.

Students are mostly turned down for these conditions, not for a missing tool, and postings state
them in a handful of fixed phrasings ("Cursando Ciência da Computação ou áreas afins", "Ensino
superior completo", "a partir do 4º semestre", "Inglês intermediário", "30 horas semanais").

Course, degree, semester, graduation and English are read from the *required* text only (see
sections.py), so "É desejável que esteja cursando entre o 4º e o 7º semestre" is not a hard
requirement. Hours are read from the whole description: they often sit under "Jornada" or
"Informações adicionais", which the skill extraction ignores. Every rule needs an explicit
statement; when in doubt, nothing is extracted (a missed condition is better than a wrong one).
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import UTC, date, datetime

from job_analyzer.models import Course, EnglishLevel, EnglishNeed, Requirements

# End of a clause: ";", a line break or a sentence end (not a decimal point as in "2028.1").
_BOUNDARY = re.compile(r"[;\n]|\.(?!\d)")

# ---------------------------------------------------------------------------------- courses
_COURSE_PATTERNS: tuple[tuple[Course, re.Pattern[str]], ...] = tuple(
    (course, re.compile(pattern))
    for course, pattern in (
        (Course.CIENCIA_DA_COMPUTACAO, r"\bciencias? da computacao\b"),
        (Course.ENGENHARIA_DA_COMPUTACAO, r"\bengenharia (?:da|de) computacao\b"),
        (Course.ENGENHARIA_DE_SOFTWARE, r"\bengenharia de software\b"),
        (Course.SISTEMAS_DE_INFORMACAO, r"\bsistemas? (?:de|da) informacao\b"),
        (
            Course.ADS,
            r"\banalise e desenvolvimento de sistemas\b|\bads\b|\banalise de sistemas\b",
        ),
        (Course.CIENCIA_DE_DADOS, r"\bciencias? de dados\b"),
        (
            Course.TECNOLOGIA_DA_INFORMACAO,
            r"\b(?:gestao (?:da |de )?)?tecnologia da informacao\b|\bti\b|\bgti\b",
        ),
        (Course.REDES, r"\bredes de computadores\b"),
        (
            Course.ENGENHARIA_OUTRA,
            r"\bengenharia (?:de |da |do |)(?:producao|mecanica|eletrica|eletronica|civil|quimica"
            r"|industrial|controle e automacao|mecatronica|de sistemas|telecomunicacoes"
            r"|ambiental|materiais|alimentos|minas|petroleo)\b",
        ),
        # A bare "Engenharia(s)": any engineering degree.
        (
            Course.ENGENHARIAS,
            r"\bengenharias\b|\bengenharia\b(?! (?:da |de |do )?(?:computacao|software|producao"
            r"|mecanica|eletrica|eletronica|civil|quimica|industrial|controle|mecatronica"
            r"|sistemas|telecomunicacoes|ambiental|materiais|alimentos|minas|petroleo|dados))",
        ),
        (Course.ESTATISTICA, r"\bestatistica\b(?! basica)"),
        (Course.MATEMATICA, r"\bmatematica\b"),
        (Course.FISICA, r"\bfisica\b"),
        (Course.ECONOMIA, r"\beconomia\b|\bciencias economicas\b"),
        (Course.ADMINISTRACAO, r"\badministracao\b"),
        (Course.CONTABEIS, r"\bciencias contabeis\b|\bcontabilidade\b"),
        (
            Course.AREA_TECNOLOGIA,
            r"\bareas? (?:de |da |relacionadas? (?:a|a area de) )?(?:tecnologia|ti)\b"
            r"|\bcursos? de tecnologia\b",
        ),
        (Course.AREA_EXATAS, r"\b(?:areas? (?:de |das )?)?exatas\b"),
    )
)
TECH_COURSES = frozenset(
    {
        Course.CIENCIA_DA_COMPUTACAO,
        Course.ENGENHARIA_DA_COMPUTACAO,
        Course.ENGENHARIA_DE_SOFTWARE,
        Course.SISTEMAS_DE_INFORMACAO,
        Course.ADS,
        Course.CIENCIA_DE_DADOS,
        Course.TECNOLOGIA_DA_INFORMACAO,
        Course.REDES,
    }
)
ENGINEERING_COURSES = frozenset(
    {Course.ENGENHARIA_DA_COMPUTACAO, Course.ENGENHARIA_DE_SOFTWARE, Course.ENGENHARIA_OUTRA}
)
EXACT_COURSES = (
    TECH_COURSES
    | ENGINEERING_COURSES
    | {
        Course.ESTATISTICA,
        Course.MATEMATICA,
        Course.FISICA,
    }
)
# Groups a posting may name; a candidate always has one concrete course.
COURSE_GROUPS: dict[Course, frozenset[Course]] = {
    # Brazilian postings use "Tecnologia da Informação" for the whole field, not one course.
    Course.TECNOLOGIA_DA_INFORMACAO: TECH_COURSES,
    Course.ENGENHARIAS: ENGINEERING_COURSES,
    Course.AREA_TECNOLOGIA: TECH_COURSES,
    Course.AREA_EXATAS: EXACT_COURSES,
}

# Where education is stated. "Pós-graduação" and "MBA" are extras, not the degree asked for.
_EDUCATION = re.compile(
    r"(?<!pos )(?<!pos-)\b(?:cursando|cursar|graduacao|graduad[oa]s?|formacao|formad[oa]s?"
    r"|ensino superior|superior (?:completo|incompleto|cursando|em andamento)|bacharel\w*"
    r"|tecnolog[oa] em|alunos? de|estudantes? de|matriculad[oa]s?)\b"
)
_EDUCATION_WINDOW = 240
# The list of courses is only an example ("... ou áreas afins").
_OPEN_LIST = re.compile(
    r"\bafins\b|\bcorrelat\w*|\brelacionad[ao]s?\b|\bsimilar(?:es)?\b|\bsemelhantes\b"
    r"|\bpreferencia\w*"
    r"|\bqualquer (?:area|curso)\b|\bentre outros\b|\bdiversas areas\b|\btodos os cursos\b"
)
_DEGREE_COMPLETE = re.compile(
    r"\b(?:(?:ensino )?superior|graduacao|formacao(?: superior| academica)?|bacharelado"
    r"|tecnologo) complet[oa]\b|\bgraduad[oa]s? em\b|\bformad[oa]s? em\b"
)
_IN_PROGRESS = re.compile(
    r"\bcursando\b|\bcursar\b|\bandamento\b|\bincomplet[oa]\b|\bem curso\b|\bem conclusao\b"
    r"|\bproxim[oa] (?:da|de) (?:conclusao|formatura)\b|\bultimos? (?:ano|semestre|periodo)s?\b"
    r"|\bmatriculad[oa]s?\b|\balunos? de\b|\bestudantes? de\b"
)

# ---------------------------------------------------------------------------------- semester
# The ordinal is required: "pelo menos 1 ano de experiência" is a duration, not a stage.
_ORD = r"(\d{1,2})\s?(?:o|a|°|\.o)"
_PERIOD = r"(semestre|periodo|ano)s?\b"
_SEMESTER_RANGE = re.compile(
    rf"\b(?:entre|do|dos)\s+(?:o\s+)?{_ORD}\s+(?:ao|a|e o|e)\s+(?:o\s+)?{_ORD}\s+{_PERIOD}"
)
_SEMESTER_MIN = re.compile(
    rf"\b(?:a partir d[oa]|acima d[oea]|apos o|(?:no )?minimo(?: de| no| o)?|pelo menos(?: no| o)?)"
    rf"\s+(?:o\s+)?{_ORD}\s+{_PERIOD}"
)
_SEMESTER_MAX = re.compile(rf"\b(?:ate o|no maximo(?: no| o)?)\s+{_ORD}\s+{_PERIOD}")
MAX_SEMESTER = 12

# ---------------------------------------------------------------------------------- graduation
_MONTHS = {
    name: number
    for number, names in enumerate(
        (
            ("janeiro", "jan"),
            ("fevereiro", "fev"),
            ("marco", "mar"),
            ("abril", "abr"),
            ("maio", "mai"),
            ("junho", "jun"),
            ("julho", "jul"),
            ("agosto", "ago"),
            ("setembro", "set"),
            ("outubro", "out"),
            ("novembro", "nov"),
            ("dezembro", "dez"),
        ),
        start=1,
    )
    for name in names
}
_MONTH = "|".join(sorted(_MONTHS, key=len, reverse=True))
_DATE = (
    rf"(?:(?:{_MONTH})(?:\s+de\s+|/|\s+)\d{{4}}|\d{{1,2}}/\d{{4}}|\d{{4}}(?:[./][12]\b)?"
    rf"|[12]o?\s+semestre\s+de\s+\d{{4}})"
)
_GRADUATION = re.compile(
    r"\b(?:previsao de (?:formatura|conclusao|termino|formacao)|formatura prevista"
    r"|conclusao (?:prevista|do curso|de curso|da graduacao|academica)|formacao academica prevista"
    r"|data de formatura|formar-se|se formar|formando em)\b"
)
_GRADUATION_WINDOW = 80
_GRAD_BETWEEN = re.compile(rf"\bentre\s+(?:o\s+|os\s+)?({_DATE})\s+e\s+(?:o\s+)?({_DATE})")
_GRAD_BETWEEN_MONTHS = re.compile(rf"\bentre\s+({_MONTH})\s+e\s+({_MONTH})\s+de\s+(\d{{4}})")
_GRAD_FROM = re.compile(rf"\b(?:a partir de|apos|depois de)\s+({_DATE})")
_GRAD_UNTIL = re.compile(rf"\b(?:ate|antes de)\s+({_DATE})")
_GRAD_AT = re.compile(rf"\b(?:para|em|no|de|:)\s*({_DATE})")

# ---------------------------------------------------------------------------------- English
_ENGLISH = re.compile(r"\bingles\b|\benglish\b")
_ENGLISH_EXCLUDED = re.compile(r"\breembolso\b|\bsubsidio\b|\baulas de\b|\bcursos? de ingles\b")
_LEVEL_WORDS: tuple[tuple[EnglishLevel, re.Pattern[str]], ...] = (
    (EnglishLevel.FLUENTE, re.compile(r"\bfluen\w*|\bnativo\b|\bc2\b")),
    (EnglishLevel.AVANCADO, re.compile(r"\bavancado\b|\badvanced\b|\bproficien\w*|\bc1\b")),
    (
        EnglishLevel.INTERMEDIARIO,
        re.compile(r"\bintermediario\b|\bintermediate\b|\bb[12]\b"),
    ),
    (EnglishLevel.BASICO, re.compile(r"\bbasico\b|\bbasic\b|\ba[12]\b")),
)
# How English is used, when no level is given ("Inglês técnico", "para conversação").
_USAGE_WORDS: tuple[tuple[EnglishLevel, re.Pattern[str]], ...] = (
    (EnglishLevel.INTERMEDIARIO, re.compile(r"\bconversacao\b")),
    (EnglishLevel.BASICO, re.compile(r"\btecnico\b|\bleitura\b|\binstrumental\b|\breading\b")),
)
# "Leitura fluente de documentação": fluent *reading*, not fluency.
_FLUENT_READING = re.compile(r"\bleitura fluente\b|\bfluent reading\b")

# ---------------------------------------------------------------------------------- hours
_NUMBER_WORDS = {
    "quatro": 4,
    "cinco": 5,
    "seis": 6,
    "sete": 7,
    "oito": 8,
    "vinte": 20,
    "trinta": 30,
}
_AMOUNT = r"(\d{1,2}|" + "|".join(_NUMBER_WORDS) + r")"
_DAILY = re.compile(
    rf"\b{_AMOUNT}\s?(?:h|hs|horas?)\b[^\d;.]{{0,20}}?(?:por dia|diari[ao]s?|/dia|ao dia)\b"
)
_WEEKLY = re.compile(
    rf"\b{_AMOUNT}\s?(?:h|hs|horas?)\b[^\d;.]{{0,25}}?(?:semanais|semanal|por semana|/semana"
    r"|na semana|semana)\b"
)
# Below 12h a week it is not a workload ("1h por dia de mentoria").
MIN_WEEKLY_HOURS, MAX_WEEKLY_HOURS = 12, 44
WORKDAYS = 5


def extract_requirements(
    required_text: str, nice_text: str, full_text: str, *, today: date | None = None
) -> Requirements:
    """Requirements stated by a posting. Texts are in matching form (accent-free)."""
    required = _join_wrapped_lines(required_text).lower()
    courses, courses_open, degree_required = _education(required)
    min_semester, max_semester = _semesters(required)
    graduation_from, graduation_to = _graduation(required, today or datetime.now(UTC).date())
    english, english_level = _english(required, nice_text.lower())
    return Requirements(
        courses=courses,
        courses_open=courses_open,
        degree_required=degree_required,
        min_semester=min_semester,
        max_semester=max_semester,
        graduation_from=graduation_from,
        graduation_to=graduation_to,
        english=english,
        english_level=english_level,
        weekly_hours=weekly_hours(full_text.lower()),
    )


def course_matches(course: Course, accepted: Iterable[Course]) -> bool:
    """Whether a candidate's course is among those a posting names (directly or by group)."""
    return any(item == course or course in COURSE_GROUPS.get(item, ()) for item in accepted)


def _join_wrapped_lines(text: str) -> str:
    """Rejoin a list broken across lines ("Administração,\\nEngenharia", "Ciência da\\ncomputação").
    Needs the original case: a line starting in lower case continues the previous one."""
    return re.sub(
        r"(?<=[,/])\s*\n\s*|(?<=\se)\s*\n\s*|(?<=\sou)\s*\n\s*|\s*\n\s*(?=(?:e|ou)\b|[a-z])",
        " ",
        text,
    )


def _education(text: str) -> tuple[list[Course], bool, bool]:
    found: set[Course] = set()
    open_list = False
    complete = in_progress = False
    for marker in _EDUCATION.finditer(text):
        window = _BOUNDARY.split(text[marker.start() : marker.start() + _EDUCATION_WINDOW])[0]
        found.update(course for course, pattern in _COURSE_PATTERNS if pattern.search(window))
        open_list = open_list or bool(_OPEN_LIST.search(window))
        complete = complete or bool(_DEGREE_COMPLETE.search(window))
        in_progress = in_progress or bool(_IN_PROGRESS.search(window))
    ordered_courses = [course for course in Course if course in found]
    return ordered_courses, open_list, complete and not in_progress


def _semesters(text: str) -> tuple[int | None, int | None]:
    if match := _SEMESTER_RANGE.search(text):
        low = _to_semester(int(match.group(1)), match.group(3), upper=False)
        high = _to_semester(int(match.group(2)), match.group(3), upper=True)
        return (low, high) if low and high and low <= high else (None, None)
    low = high = None
    if match := _SEMESTER_MIN.search(text):
        low = _to_semester(int(match.group(1)), match.group(2), upper=False)
    if match := _SEMESTER_MAX.search(text):
        high = _to_semester(int(match.group(1)), match.group(2), upper=True)
    if low and high and low > high:
        return None, None
    return low, high


def _to_semester(number: int, unit: str, *, upper: bool) -> int | None:
    """'3º ano' -> semesters 5..6 (first or last depending on the bound)."""
    semester = (number * 2 if upper else number * 2 - 1) if unit == "ano" else number
    return semester if 1 <= semester <= MAX_SEMESTER else None


def _graduation(text: str, today: date) -> tuple[str | None, str | None]:
    for trigger in _GRADUATION.finditer(text):
        window = text[trigger.end() : trigger.end() + _GRADUATION_WINDOW]
        window = re.split(r"[;\n]", window)[0].replace("aproximadamente", " ").replace(",", " ")
        window = " ".join(window.split())
        bounds = _graduation_bounds(window)
        if bounds is None:
            continue
        low, high = bounds
        if all(_plausible_year(bound, today) for bound in (low, high) if bound) and (
            not low or not high or low <= high
        ):
            return low, high
    return None, None


def _graduation_bounds(window: str) -> tuple[str | None, str | None] | None:
    if match := _GRAD_BETWEEN_MONTHS.search(window):
        year = match.group(3)
        return f"{year}-{_MONTHS[match.group(1)]:02d}", f"{year}-{_MONTHS[match.group(2)]:02d}"
    if match := _GRAD_BETWEEN.search(window):
        start, end = _parse_date(match.group(1)), _parse_date(match.group(2))
        return (start[0], end[1]) if start and end else None
    if match := _GRAD_FROM.search(window):
        start = _parse_date(match.group(1))
        return (start[0], None) if start else None
    if match := _GRAD_UNTIL.search(window):
        end = _parse_date(match.group(1))
        return (None, end[1]) if end else None
    if match := _GRAD_AT.search(window):
        span = _parse_date(match.group(1))
        return span if span else None
    return None


def _parse_date(value: str) -> tuple[str, str] | None:
    """A date expression as its first and last month: '2028' -> ('2028-01', '2028-12')."""
    value = value.strip()
    if match := re.fullmatch(rf"({_MONTH})(?:\s+de\s+|/|\s+)(\d{{4}})", value):
        month = f"{match.group(2)}-{_MONTHS[match.group(1)]:02d}"
        return month, month
    if match := re.fullmatch(r"(\d{1,2})/(\d{4})", value):
        number = int(match.group(1))
        if not 1 <= number <= 12:
            return None
        month = f"{match.group(2)}-{number:02d}"
        return month, month
    if match := re.fullmatch(r"(\d{4})[./]([12])", value) or re.fullmatch(
        r"([12])o?\s+semestre\s+de\s+(\d{4})", value
    ):
        first, second = match.groups()
        year, half = (first, second) if len(first) == 4 else (second, first)
        return (f"{year}-01", f"{year}-06") if half == "1" else (f"{year}-07", f"{year}-12")
    if re.fullmatch(r"\d{4}", value):
        return f"{value}-01", f"{value}-12"
    return None


def _plausible_year(month: str, today: date) -> bool:
    return today.year - 1 <= int(month[:4]) <= today.year + 7


def _english(required: str, nice: str) -> tuple[EnglishNeed | None, EnglishLevel | None]:
    level, found = _english_level(required)
    if found:
        return EnglishNeed.EXIGIDO, level
    level, found = _english_level(nice)
    if found:
        return EnglishNeed.DIFERENCIAL, level
    return None, None


def _english_level(text: str) -> tuple[EnglishLevel | None, bool]:
    """The lowest level accepted ("intermediário a avançado" -> intermediário)."""
    text = _FLUENT_READING.sub("leitura", text)
    levels: list[EnglishLevel] = []
    found = False
    for mention in _ENGLISH.finditer(text):
        before = _BOUNDARY.split(text[max(0, mention.start() - 40) : mention.start()])[-1]
        after = _BOUNDARY.split(text[mention.end() : mention.end() + 80])[0]
        clause = before + mention.group() + after
        if _ENGLISH_EXCLUDED.search(clause):
            continue
        found = True
        explicit = [level for level, pattern in _LEVEL_WORDS if pattern.search(clause)]
        usage = [level for level, pattern in _USAGE_WORDS if pattern.search(clause)]
        if candidates := explicit or usage:
            levels.append(min(candidates, key=_rank))
    return (min(levels, key=_rank) if levels else None), found


def _rank(level: EnglishLevel) -> int:
    return list(EnglishLevel).index(level)


def weekly_hours(text: str) -> int | None:
    """Weekly workload: '30 horas semanais' -> 30, '6h por dia' -> 30."""
    if match := _WEEKLY.search(text):
        hours = _amount(match.group(1))
    elif match := _DAILY.search(text):
        hours = _amount(match.group(1)) * WORKDAYS
    else:
        return None
    return hours if MIN_WEEKLY_HOURS <= hours <= MAX_WEEKLY_HOURS else None


def _amount(value: str) -> int:
    return _NUMBER_WORDS.get(value) or int(value)
