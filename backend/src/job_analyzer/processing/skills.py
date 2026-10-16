"""Skill taxonomy and extractor.

Each skill has a stable slug (used by the API), a display name, a category and one or more regular
expressions. Patterns run against accent-free text (see `matching_form`) and are case-insensitive
unless a spec says otherwise. Ambiguous names (R, Go, Excel, Spring...) use context so ordinary
words ("R$ 1.500", "to excel at", "Spring 2026") do not count as skills.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from enum import StrEnum

from job_analyzer.models import Area


class SkillCategory(StrEnum):
    LINGUAGENS = "linguagens"
    DADOS_BI = "dados_bi"
    BANCOS_DE_DADOS = "bancos_de_dados"
    CLOUD_DEVOPS = "cloud_devops"
    INFRA_SUPORTE = "infra_suporte"
    FRAMEWORKS = "frameworks"
    AUTOMACAO_QA = "automacao_qa"
    IA_ML = "ia_ml"
    COMPETENCIAS_GERAIS = "competencias_gerais"


CATEGORY_LABELS: dict[SkillCategory, str] = {
    SkillCategory.LINGUAGENS: "Linguagens",
    SkillCategory.DADOS_BI: "Dados & BI",
    SkillCategory.BANCOS_DE_DADOS: "Bancos de Dados",
    SkillCategory.CLOUD_DEVOPS: "Cloud & DevOps",
    SkillCategory.INFRA_SUPORTE: "Infraestrutura & Suporte",
    SkillCategory.FRAMEWORKS: "Frameworks & Web",
    SkillCategory.AUTOMACAO_QA: "Automação & QA",
    SkillCategory.IA_ML: "IA & Machine Learning",
    SkillCategory.COMPETENCIAS_GERAIS: "Competências Gerais",
}

# Used only as a fallback to place generic titles ("Estágio em TI") into an area.
CATEGORY_AREA_HINTS: dict[SkillCategory, Area] = {
    SkillCategory.DADOS_BI: Area.DADOS,
    SkillCategory.IA_ML: Area.DADOS,
    SkillCategory.AUTOMACAO_QA: Area.AUTOMACAO,
    SkillCategory.FRAMEWORKS: Area.DESENVOLVIMENTO,
    SkillCategory.INFRA_SUPORTE: Area.INFRAESTRUTURA,
}


@dataclass(frozen=True, slots=True)
class SkillSpec:
    slug: str
    name: str
    category: SkillCategory
    patterns: tuple[str, ...]
    case_sensitive: bool = False
    regex: re.Pattern[str] = field(init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        flags = 0 if self.case_sensitive else re.IGNORECASE
        compiled = re.compile("|".join(f"(?:{pattern})" for pattern in self.patterns), flags)
        object.__setattr__(self, "regex", compiled)


def _skill(
    slug: str, name: str, category: SkillCategory, *patterns: str, case_sensitive: bool = False
) -> SkillSpec:
    return SkillSpec(slug, name, category, patterns, case_sensitive)


L, D, B, C = (
    SkillCategory.LINGUAGENS,
    SkillCategory.DADOS_BI,
    SkillCategory.BANCOS_DE_DADOS,
    SkillCategory.CLOUD_DEVOPS,
)
F, A, I, G = (  # noqa: E741 - short aliases keep the table below readable
    SkillCategory.FRAMEWORKS,
    SkillCategory.AUTOMACAO_QA,
    SkillCategory.IA_ML,
    SkillCategory.COMPETENCIAS_GERAIS,
)
S = SkillCategory.INFRA_SUPORTE

# Words that commonly sit right before a one-letter language in a list ("Python e R", "SAS/R").
_LIST_CONTEXT = (
    r"(?:(?<=, )|(?<=/)|(?<=\()|(?<= e )|(?<= ou )|(?<= and )|(?<= or )|(?<=nguagem )|(?<=nguage ))"
)

TAXONOMY: tuple[SkillSpec, ...] = (
    # ------------------------------------------------------------------ Linguagens
    _skill("python", "Python", L, r"\bpython\b"),
    _skill("sql", "SQL", L, r"\bsql\b"),
    _skill("java", "Java", L, r"\bjava\b(?![\s-]*script)"),
    _skill(
        "javascript",
        "JavaScript",
        L,
        r"\bjavascript\b",
        r"\bes6\b",
        r"\b(?:node|vue|next|react)?\.js\b",
    ),
    _skill("typescript", "TypeScript", L, r"\btypescript\b"),
    _skill("csharp", "C#", L, r"(?<![\w#])c\s?#(?![\w#])", r"\bc-?sharp\b"),
    _skill("cpp", "C++", L, r"(?<![\w+])c\+\+(?![\w+])", r"\bcpp\b"),
    _skill(
        "go",
        "Go",
        L,
        r"\b(?i:golang)\b",
        _LIST_CONTEXT + r"Go\b(?![-'])",
        r"\bGo(?=\s*[,/)])",
        case_sensitive=True,
    ),
    _skill("rust", "Rust", L, r"\brust\b"),
    _skill("php", "PHP", L, r"\bphp\b"),
    _skill("ruby", "Ruby", L, r"\bruby\b"),
    _skill("kotlin", "Kotlin", L, r"\bkotlin\b"),
    _skill("swift", "Swift", L, r"\bswift\b(?!\s*(?:code|message))"),
    _skill(
        "r",
        "R",
        L,
        _LIST_CONTEXT + r"R(?![\w$&.'+-])",
        r"\bR(?=\s*[,/)])(?!\$)",
        case_sensitive=True,
    ),
    _skill("scala", "Scala", L, r"\bscala\b"),
    _skill("vba", "VBA", L, r"\bvba\b"),
    _skill("shell", "Shell Script", L, r"\bbash\b", r"\bshell\s?script", r"\bpowershell\b"),
    # ------------------------------------------------------------------ Dados & BI
    _skill("power-bi", "Power BI", D, r"\bpower\s?bi\b", r"\bpbi\b"),
    _skill("excel", "Excel", D, r"(?<!to )\bexcel\b(?!\s+(?:at|in|as|with|on)\b)"),
    _skill("tableau", "Tableau", D, r"\btableau\b"),
    _skill("looker", "Looker", D, r"\blooker\b", r"\bdata studio\b"),
    _skill("qlik", "Qlik", D, r"\bqlik"),
    _skill("pandas", "Pandas", D, r"\bpandas\b"),
    _skill("numpy", "NumPy", D, r"\bnumpy\b"),
    _skill(
        "spark",
        "Spark",
        D,
        r"\b(?:Py)?Spark\b",
        r"\b(?:PYSPARK|SPARK|pyspark)\b",
        case_sensitive=True,
    ),
    _skill("databricks", "Databricks", D, r"\bdatabricks\b"),
    _skill("airflow", "Airflow", D, r"\bairflow\b"),
    _skill("dbt", "dbt", D, r"\bdbt\b"),
    _skill("etl", "ETL / ELT", D, r"\betls?\b", r"\belt\b(?=\s*[,/)])"),
    _skill(
        "data-warehouse",
        "Data Warehouse / Lake",
        D,
        r"\bdata\s?(?:warehouse|lake(?:house)?|mart)s?\b",
    ),
    _skill("snowflake", "Snowflake", D, r"\bsnowflake\b"),
    _skill("bigquery", "BigQuery", D, r"\bbig\s?query\b"),
    _skill("kafka", "Kafka", D, r"\bkafka\b"),
    _skill("dax", "DAX", D, r"\bdax\b(?![-\w])(?!\s*(?:-|konzern|unternehmen))"),
    _skill("power-query", "Power Query", D, r"\bpower\s?query\b"),
    _skill("statistics", "Estatística", D, r"\bestatistica\b", r"\bstatistics\b", r"\bstatistik\b"),
    # ------------------------------------------------------------------ Bancos de dados
    _skill("postgresql", "PostgreSQL", B, r"\bpostgres(?:ql)?\b"),
    _skill("mysql", "MySQL", B, r"\bmysql\b"),
    _skill("sql-server", "SQL Server", B, r"\bsql\s?server\b", r"\bmssql\b"),
    _skill("oracle", "Oracle", B, r"\boracle\b"),
    _skill("mongodb", "MongoDB", B, r"\bmongo(?:db)?\b"),
    _skill("redis", "Redis", B, r"\bredis\b"),
    _skill("nosql", "NoSQL", B, r"\bnosql\b"),
    # ------------------------------------------------------------------ Cloud & DevOps
    _skill("aws", "AWS", C, r"\baws\b", r"\bamazon web services\b"),
    _skill("azure", "Azure", C, r"\bazure\b"),
    _skill("gcp", "Google Cloud", C, r"\bgcp\b", r"\bgoogle cloud\b"),
    _skill("git", "Git", C, r"\bgit\b", r"\bgithub\b", r"\bgitlab\b", r"\bbitbucket\b"),
    _skill("docker", "Docker", C, r"\bdocker\b"),
    _skill("kubernetes", "Kubernetes", C, r"\bkubernetes\b", r"\bk8s\b"),
    _skill(
        "ci-cd",
        "CI/CD",
        C,
        r"\bci\s?/\s?cd\b",
        r"\bci-cd\b",
        r"\bcicd\b",
        r"\bjenkins\b",
        r"\bgithub actions\b",
        r"\bcontinuous (?:integration|delivery|deployment)\b",
        r"\bintegracao continua\b",
    ),
    _skill("linux", "Linux", C, r"\blinux\b", r"\bunix\b"),
    # ------------------------------------------------------------------ Infraestrutura & Suporte
    _skill("windows", "Windows / Windows Server", S, r"\bwindows\b(?! phone)"),
    _skill(
        "active-directory",
        "Active Directory",
        S,
        r"\bactive directory\b",
        r"\bazure ad\b",
        r"\bentra id\b",
        r"\bgpos?\b",
    ),
    _skill(
        "networking",
        "Redes (TCP/IP)",
        S,
        r"\btcp/?ip\b",
        r"\bredes de computadores\b",
        r"\b(?:conhecimentos? |nocoes |fundamentos )(?:basicos? )?(?:em |de )redes\b",
        r"\bdhcp\b",
        r"\bvlans?\b",
        r"\broteamento\b",
        r"\bswitch(?:es|ing)?\b",
        r"\bnetworking\b",
        r"\bccna\b",
    ),
    _skill("itil", "ITIL", S, r"\bitil\b"),
    _skill(
        "hardware",
        "Hardware e manutenção",
        S,
        r"\bhardware\b",
        r"\bmanutencao (?:de |em )(?:computadores|micros|notebooks|equipamentos de informatica)\b",
        r"\bmontagem (?:e manutencao )?de (?:computadores|micros)\b",
        r"\bformatacao\b",
    ),
    _skill(
        "microsoft-365",
        "Microsoft 365 (administração)",
        S,
        r"\bmicrosoft 365\b",
        r"\bm365\b",
        r"\bexchange (?:online|server)\b",
        r"\bmicrosoft exchange\b",
        r"\bintune\b",
    ),
    _skill(
        "firewall",
        "Firewall e VPN",
        S,
        r"\bfirewalls?\b",
        r"\bfortigate\b",
        r"\bfortinet\b",
        r"\bpalo alto\b",
        r"\bvpns?\b",
    ),
    _skill(
        "virtualization",
        "Virtualização",
        S,
        r"\bvirtualizacao\b",
        r"\bvmware\b",
        r"\bhyper-?v\b",
        r"\bproxmox\b",
    ),
    _skill(
        "ticketing",
        "Sistemas de chamados",
        S,
        r"\bglpi\b",
        r"\bservicenow\b",
        r"\botrs\b",
        r"\bzendesk\b",
        r"\b(?:sistemas?|ferramentas?|abertura|atendimento) (?:de )?chamados\b",
        r"\btickets? de suporte\b",
    ),
    _skill(
        "information-security",
        "Segurança da Informação",
        S,
        # Knowledge or practice of it ("noções de segurança da informação", "boas práticas de
        # cibersegurança") or a security job. Not team names ("equipes de ... Segurança da
        # Informação"), policies to follow, or a company describing itself.
        r"\b(?:conhecimentos?|nocoes|boas praticas|fundamentos|experiencia|vivencia|familiaridade"
        r"|interesse|atuar|apoiar|testes)\b[^.;|\n]{0,40}"
        r"\b(?:seguranca da informacao|ciberseguranca|cyber ?seguranca|seguranca cibernetica)\b",
        r"\b(?:analista|estagi\w*|assistente|consultor\w*|especialista|area)(?:\(a\))? (?:de |em )?"
        r"(?:ti - )?(?:seguranca da informacao|ciberseguranca|cyber ?seguranca)\b",
        r"\bcyber ?security\b",
        r"\biso ?27001\b",
        r"\bsiem\b",
        r"\bpentest\w*",
        r"\b(?:analise|gestao) de vulnerabilidades\b",
        r"\bred team\b",
    ),
    _skill("terraform", "Terraform", C, r"\bterraform\b"),
    # ------------------------------------------------------------------ Frameworks & Web
    _skill("react", "React", F, r"\breact(?:\.?js)?\b(?![\s-]*native)"),
    _skill("angular", "Angular", F, r"\bangular(?:js)?\b"),
    _skill("vue", "Vue.js", F, r"\bvue(?:\.?js)?\b"),
    _skill("nextjs", "Next.js", F, r"\bnext\.?js\b"),
    _skill("html", "HTML", F, r"\bhtml5?\b"),
    _skill("css", "CSS", F, r"\bcss3?\b", r"\bsass\b", r"\bscss\b"),
    _skill("tailwind", "Tailwind CSS", F, r"\btailwind\b"),
    _skill("nodejs", "Node.js", F, r"\bnode(?:\.?js)?\b(?!\s+(?:de|of)\b)"),
    _skill("dotnet", ".NET", F, r"(?<![\w.])\.net\b", r"\bdotnet\b", r"\basp\.net\b"),
    _skill("django", "Django", F, r"\bdjango\b"),
    _skill("flask", "Flask", F, r"\bflask\b"),
    _skill("fastapi", "FastAPI", F, r"\bfast\s?api\b"),
    _skill(
        "spring",
        "Spring",
        F,
        r"\bspring[\s-]?(?:boot|framework|mvc|cloud|security|data)\b",
        r"\bspring\b(?=\s*[,/)])",
    ),
    _skill("laravel", "Laravel", F, r"\blaravel\b"),
    _skill(
        "rest-api",
        "APIs REST",
        F,
        r"\brest(?:ful)?\s*(?:apis?|services?)\b",
        r"\bapis?\s*rest(?:ful)?\b",
        r"\brestful\b",
        r"\bapis?\b",
    ),
    _skill("graphql", "GraphQL", F, r"\bgraphql\b"),
    _skill(
        "microservices", "Microsserviços", F, r"\bmicro-?servic(?:os|es)\b", r"\bmicrosservicos\b"
    ),
    _skill("flutter", "Flutter", F, r"\bflutter\b"),
    _skill("react-native", "React Native", F, r"\breact[\s-]?native\b"),
    _skill("android", "Android", F, r"\bandroid\b"),
    _skill("ios", "iOS", F, r"\bios\b"),
    # ------------------------------------------------------------------ Automação & QA
    _skill(
        "rpa", "RPA", A, r"\brpa\b", r"\brobotic process automation\b", r"\bautomacao robotica\b"
    ),
    _skill("uipath", "UiPath", A, r"\bui\s?path\b"),
    _skill("automation-anywhere", "Automation Anywhere", A, r"\bautomation anywhere\b"),
    _skill("blue-prism", "Blue Prism", A, r"\bblue\s?prism\b"),
    _skill("power-automate", "Power Automate", A, r"\bpower\s?automate\b", r"\bmicrosoft flow\b"),
    _skill("power-apps", "Power Apps", A, r"\bpower\s?apps?\b"),
    _skill("selenium", "Selenium", A, r"\bselenium\b"),
    _skill("cypress", "Cypress", A, r"\bcypress\b"),
    _skill("playwright", "Playwright", A, r"\bplaywright\b"),
    _skill("robot-framework", "Robot Framework", A, r"\brobot\s?framework\b"),
    _skill(
        "test-automation",
        "Testes Automatizados",
        A,
        r"\btestes? automatizados?\b",
        r"\bautomacao de testes?\b",
        r"\btest automation\b",
        r"\bautomated test(?:s|ing)?\b",
        r"\btestes? (?:unitarios|de integracao|e2e)\b",
        r"\bunit tests?\b",
    ),
    _skill("postman", "Postman", A, r"\bpostman\b"),
    _skill("n8n", "n8n", A, r"\bn8n\b"),
    _skill("plc", "CLP / PLC", A, r"\bclps?\b", r"\bplcs?\b", r"\bscada\b"),
    # ------------------------------------------------------------------ IA & ML
    _skill(
        "machine-learning",
        "Machine Learning",
        I,
        r"\bmachine learning\b",
        r"\baprendizado de maquina\b",
    ),
    _skill(
        "deep-learning",
        "Deep Learning",
        I,
        r"\bdeep learning\b",
        r"\bredes neurais\b",
        r"\bneural networks?\b",
    ),
    _skill("scikit-learn", "scikit-learn", I, r"\bscikit[\s-]?learn\b", r"\bsklearn\b"),
    _skill("tensorflow", "TensorFlow", I, r"\btensorflow\b"),
    _skill("pytorch", "PyTorch", I, r"\bpytorch\b"),
    _skill(
        "genai",
        "IA Generativa / LLMs",
        I,
        r"\bllms?\b",
        r"\bia generativa\b",
        r"\bgenerative ai\b",
        r"\bgen\s?ai\b",
        r"\blarge language models?\b",
        r"\bchatgpt\b",
        r"\bopenai\b",
        r"\blangchain\b",
    ),
    _skill(
        "ai",
        "Inteligência Artificial",
        I,
        r"\binteligencia artificial\b",
        r"\bartificial intelligence\b",
        r"(?-i:\bIA\b)",
        r"(?-i:\bAI\b)",
    ),
    _skill("nlp", "NLP", I, r"\bnlp\b", r"\bprocessamento de linguagem natural\b"),
    # ------------------------------------------------------------------ Competências gerais
    _skill("english", "Inglês", G, r"\bingles\b", r"\benglish\b", r"\benglisch"),
    _skill("spanish", "Espanhol", G, r"\bespanhol\b", r"\bspanish\b"),
    _skill(
        "agile",
        "Metodologias Ágeis",
        G,
        r"\bscrum\b",
        r"\bkanban\b",
        r"\bmetodologias? ageis\b",
        r"\bmetodos ageis\b",
        r"\bagile\b",
    ),
    _skill("jira", "Jira", G, r"\bjira\b"),
    _skill(
        "office",
        "Pacote Office",
        G,
        r"\bpacote office\b",
        r"\b(?:microsoft|ms) office\b",
        r"\boffice 365\b",
    ),
)

SKILLS_BY_SLUG: dict[str, SkillSpec] = {spec.slug: spec for spec in TAXONOMY}


class SkillExtractor:
    def __init__(self, taxonomy: Iterable[SkillSpec] = TAXONOMY) -> None:
        self._taxonomy = tuple(taxonomy)

    def extract(self, text: str) -> list[str]:
        """Return the slugs found in `text` (expected in `matching_form`), in taxonomy order."""
        if not text:
            return []
        return [spec.slug for spec in self._taxonomy if spec.regex.search(text)]


_INLINE_IGNORECASE = re.compile(r"\(\?i:([A-Za-z]+)\)")
_CASE_SENSITIVE_PART = re.compile(r"\(\?-i:(.*)\)", re.DOTALL)


def browser_patterns(spec: SkillSpec) -> list[tuple[str, bool]]:
    """The skill's rule as (pattern, ignore_case) pairs JavaScript engines accept, with the same
    matches. Python's scoped flags are the only incompatible syntax in the taxonomy: a part that is
    entirely "(?-i:...)" gets its own case-sensitive pattern, and "(?i:golang)" becomes character
    classes ("[Gg][Oo]...")."""

    def expand(match: re.Match[str]) -> str:
        return "(?:" + "".join(f"[{c.upper()}{c.lower()}]" for c in match.group(1)) + ")"

    result: list[tuple[str, bool]] = []
    for part in spec.patterns:
        pattern, ignore_case = part, not spec.case_sensitive
        if whole := _CASE_SENSITIVE_PART.fullmatch(part):
            pattern, ignore_case = whole.group(1), False
        result.append((_INLINE_IGNORECASE.sub(expand, pattern), ignore_case))
    return result


def is_known_skill(slug: str) -> bool:
    return slug in SKILLS_BY_SLUG
