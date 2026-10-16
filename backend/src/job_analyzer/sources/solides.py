"""Sólides Vagas (Brazil) - the public search endpoint used by vagas.solides.com.br.

Sólides is the ATS of thousands of small and mid-sized Brazilian companies, so it complements Gupy
(mostly large companies). This is not an officially documented API: it is used here for educational
purposes only, at a low request rate. Contract changes surface as invalid items, not crashes.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime
from typing import Any
from urllib.parse import urljoin

from job_analyzer.brazil import state_code
from job_analyzer.exceptions import SourceError
from job_analyzer.models import Affirmative, Contract, SourceName, Workplace
from job_analyzer.processing.text import matching_form
from job_analyzer.sources.base import JobSource, RawItem, entry_level_hints

TECH_AREA = "tecnologia"
OPEN_STATE = "em_andamento"
# Results are sorted newest first. The upstream "estagio" seniority filter matches nothing, so
# internships are found by title instead; "junior" works as a filter.
QUERIES: tuple[dict[str, str], ...] = (
    {"occupationAreas": TECH_AREA, "title": "estagio"},
    {"occupationAreas": TECH_AREA, "seniorities": "junior"},
)
WORKPLACES = {
    "remoto": Workplace.REMOTO,
    "hibrido": Workplace.HIBRIDO,
    "presencial": Workplace.PRESENCIAL,
}
# recruitmentContractType names ("CLT", "PJ", "Estágio"...), accent-free and lower-cased.
CONTRACTS = {
    "clt": Contract.CLT,
    "pj": Contract.PJ,
    "estagio": Contract.ESTAGIO,
    "temporario": Contract.TEMPORARIO,
    "freelancer": Contract.FREELANCER,
    "autonomo": Contract.FREELANCER,
}
# Keywords of the affirmative labels ("Vaga afirmativa para Pessoas Pretas", "...com +40 anos").
AFFIRMATIVE_KEYWORDS = (
    ("deficien", Affirmative.PCD),
    ("pcd", Affirmative.PCD),
    ("mulher", Affirmative.MULHERES),
    ("pret", Affirmative.PESSOAS_NEGRAS),
    ("negr", Affirmative.PESSOAS_NEGRAS),
    ("indigen", Affirmative.INDIGENAS),
    ("lgbt", Affirmative.LGBTQIA),
    ("40", Affirmative.PESSOAS_40_MAIS),
    ("50", Affirmative.PESSOAS_40_MAIS),
)


class SolidesSource(JobSource):
    name = SourceName.SOLIDES
    label = "Sólides"

    def iter_items(self) -> Iterator[RawItem]:
        url = str(self.settings.solides_api_url)

        for query in QUERIES:
            for page in range(1, self.settings.solides_max_pages_per_query + 1):
                try:
                    payload = self.http.get_json(url, params={**query, "page": page})
                except SourceError as exc:
                    self.record_error(f"query {query} page {page}: {exc}")
                    break

                data = payload.get("data") if isinstance(payload, dict) else None
                if not isinstance(data, list):
                    self.record_error(f"query {query} page {page}: unexpected payload shape")
                    break

                yield from (item for item in data if isinstance(item, dict))

                total_pages = payload.get("totalPages")
                if not data or (isinstance(total_pages, int) and page >= total_pages):
                    break

    def to_raw_job(self, item: RawItem) -> dict[str, Any] | None:
        if item.get("currentState") not in (None, OPEN_STATE):
            return None
        state = _name(item.get("state"), "code")
        uf = state_code(state)
        if state and uf is None:
            return None

        city = _name(item.get("city"))
        if city and city.isupper():
            city = city.title()
        job_type = item.get("jobType")
        requirements = [_name(skill) for skill in item.get("hardSkills") or []]
        # Labelled lines: appended after a "Benefícios" section, bare skill names would be read as
        # benefits (see processing/sections.py); the benefits list feeds the benefit tags.
        skills = ", ".join(req for req in requirements if req)
        benefits = ", ".join(name for raw in item.get("benefits") or [] if (name := _name(raw)))
        description = "\n".join(
            [
                item.get("description") or "",
                *([f"Competências: {skills}"] if skills else []),
                *([f"Benefícios: {benefits}"] if benefits else []),
            ]
        )
        return {
            "source_id": str(item["id"]),
            "title": item["title"],
            "company": item.get("companyName"),
            "location": ", ".join(part for part in (city, uf) if part) or None,
            "description": description,
            "url": urljoin(str(self.settings.solides_api_url), f"/vaga/{item['id']}"),
            "published_at": _parse_date(item.get("createdAt")),
            "city": city,
            "state": uf,
            "workplace": WORKPLACES.get(job_type or ""),
            "contracts": [
                contract
                for name in item.get("recruitmentContractType") or []
                if (contract := CONTRACTS.get(_key(_name(name))))
            ],
            "affirmative": [
                *_affirmative(_name(label) for label in item.get("affirmative") or []),
                *([Affirmative.PCD] if item.get("pcdOnly") is True else []),
            ],
            "accepts_pcd": item.get("peopleWithDisabilities") is True
            or item.get("pcdOnly") is True,
            **_salary(item.get("salary")),
            "hints": [
                *entry_level_hints(_name(level) for level in item.get("seniority") or []),
                *([job_type] if job_type else []),
            ],
        }


def _name(value: Any, key: str = "name") -> str | None:
    """Sólides wraps most labels as {"name": ...}; plain strings are accepted too."""
    if isinstance(value, dict):
        value = value.get(key)
    return (value.strip() or None) if isinstance(value, str) else None


def _salary(value: Any) -> dict[str, float | None]:
    """Monthly salary, only when the company chose to show it.

    "simple" carries a single value in `finalRange` (`initialRange` is 0); "range" carries both
    ends. Zero means "not informed". RawJob drops implausible values.
    """
    if not isinstance(value, dict) or value.get("showRangeToApplicant") is not True:
        return {}
    low, high = _amount(value.get("initialRange")), _amount(value.get("finalRange"))
    if value.get("type") == "simple":
        return {"salary_min": high, "salary_max": high} if high else {}
    if value.get("type") == "range":
        return {"salary_min": low or None, "salary_max": high or None}
    return {}


def _amount(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value) if value > 0 else None


def _key(value: str | None) -> str:
    return matching_form(value).casefold().strip() if value else ""


def _affirmative(labels: Any) -> list[Affirmative]:
    groups: list[Affirmative] = []
    for label in labels:
        key = _key(label)
        groups.extend(group for word, group in AFFIRMATIVE_KEYWORDS if word in key)
    return list(dict.fromkeys(groups))


def _parse_date(value: Any) -> datetime | None:
    """`createdAt` is a bare date ("2026-10-09"); RawJob requires a timezone-aware datetime."""
    if not isinstance(value, str):
        return None
    try:
        parsed = date.fromisoformat(value[:10])
    except ValueError:
        return None
    return datetime(parsed.year, parsed.month, parsed.day, tzinfo=UTC)
