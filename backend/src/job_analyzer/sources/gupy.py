"""Gupy (Brazil) - the public search endpoint used by portal.gupy.io.

This is not an officially documented API: it is used here for educational purposes only, at a low
request rate, keeping just the fields needed for aggregate statistics. If Gupy changes the
contract, items fail validation and are counted as invalid instead of breaking the pipeline.
Gupy also hosts some postings abroad (Mexico, Argentina...): those are skipped.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date
from typing import Any

from job_analyzer.brazil import state_code
from job_analyzer.exceptions import SourceError
from job_analyzer.models import Contract, SourceName, Workplace
from job_analyzer.sources.base import JobSource, RawItem

INTERNSHIP_TYPE = "vacancy_type_internship"
JUNIOR_TERMS = ("junior", "jr")
CONTRACTS = {
    "vacancy_type_effective": Contract.CLT,
    "vacancy_legal_entity": Contract.PJ,
    INTERNSHIP_TYPE: Contract.ESTAGIO,
    "vacancy_type_temporary": Contract.TEMPORARIO,
    "vacancy_type_autonomous": Contract.FREELANCER,
}
WORKPLACES = {
    "remote": Workplace.REMOTO,
    "hybrid": Workplace.HIBRIDO,
    "on-site": Workplace.PRESENCIAL,
}


class GupySource(JobSource):
    name = SourceName.GUPY
    label = "Gupy"

    def _queries(self) -> Iterator[dict[str, str]]:
        # The portal caps each search at ~100 results and matches titles only, so many narrow
        # queries beat one broad one: every term is searched restricted to internships, and with
        # "junior" and "jr" (the search treats them as different words).
        for term in self.settings.gupy_search_terms:
            yield {"jobName": term, "type": INTERNSHIP_TYPE}
            for seniority in JUNIOR_TERMS:
                yield {"jobName": f"{term} {seniority}"}
        # Entry-level titles that carry no level word ("Assistente de TI", "Analista de Dados I").
        for title in self.settings.gupy_entry_titles:
            yield {"jobName": title}

    def iter_items(self) -> Iterator[RawItem]:
        url = str(self.settings.gupy_api_url)
        page_size = self.settings.gupy_page_size

        for query in self._queries():
            for page in range(self.settings.gupy_max_pages_per_query):
                offset = page * page_size
                try:
                    payload = self.http.get_json(
                        url, params={**query, "limit": page_size, "offset": offset}
                    )
                except SourceError as exc:
                    self.record_error(f"query {query['jobName']!r} offset {offset}: {exc}")
                    break

                data = payload.get("data") if isinstance(payload, dict) else None
                if not isinstance(data, list):
                    self.record_error(f"query {query['jobName']!r}: unexpected payload shape")
                    break

                yield from (item for item in data if isinstance(item, dict))

                total = _as_int((payload.get("pagination") or {}).get("total"))
                if len(data) < page_size or (total is not None and offset + page_size >= total):
                    break

    def to_raw_job(self, item: RawItem) -> dict[str, Any] | None:
        city, state = item.get("city"), item.get("state")
        uf = state_code(state)
        # Foreign postings carry a foreign city and no Brazilian state. Remote postings often have
        # no location at all and are kept (Gupy is a Brazilian platform).
        if (city or state) and uf is None:
            return None
        workplace = item.get("workplaceType")
        contract = CONTRACTS.get(item.get("type") or "")
        badges = item.get("badges")
        is_pwd = isinstance(badges, dict) and badges.get("isPWD") is True
        location = ", ".join(part for part in (city, state) if part)
        return {
            "source_id": str(item["id"]),
            "title": item["name"],
            "company": item.get("careerPageName"),
            "location": location or None,
            "description": item.get("description") or "",
            "url": item["jobUrl"],
            "published_at": item.get("publishedDate"),
            "city": city,
            "state": uf,
            "workplace": WORKPLACES.get(workplace or ""),
            "contracts": [contract] if contract else [],
            # "Vaga também para PcD": open to PcD candidates (not an affirmative-action posting).
            "accepts_pcd": item.get("disabilities") is True or is_pwd,
            "deadline": _date_part(item.get("applicationDeadline")),
            "hints": [hint for hint in (item.get("type"), workplace) if hint],
        }


def _date_part(value: Any) -> date | None:
    """ "2026-10-20T00:00:00.000Z" -> 2026-10-20 (the last day to apply)."""
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
