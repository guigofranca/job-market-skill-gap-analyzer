"""Common contract for job sources.

A source only has to (1) iterate over the raw items of its API and (2) map one item to the fields
of RawJob (or to None when the posting is out of scope, e.g. abroad or closed). Validation,
deduplication and error accounting are handled here, once, for every source.
"""

from __future__ import annotations

import logging
import re
from abc import ABC, abstractmethod
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from typing import Any, ClassVar

from pydantic import ValidationError

from job_analyzer.config import Settings
from job_analyzer.http_client import HttpClient
from job_analyzer.models import RawJob, SourceName
from job_analyzer.processing.text import matching_form

logger = logging.getLogger(__name__)

RawItem = dict[str, Any]

_ABOVE_ENTRY_LEVEL = re.compile(r"pleno|senior|especialista|principal|lead|lider", re.IGNORECASE)


@dataclass(slots=True)
class FetchResult:
    source: SourceName
    jobs: list[RawJob] = field(default_factory=list)
    received: int = 0
    invalid: int = 0
    skipped: int = 0
    duplicates: int = 0
    errors: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


class JobSource(ABC):
    name: ClassVar[SourceName]
    label: ClassVar[str]

    def __init__(self, settings: Settings, http: HttpClient) -> None:
        self.settings = settings
        self.http = http
        self._errors: list[str] = []

    @classmethod
    def is_configured(cls, settings: Settings) -> bool:
        """Sources that need credentials override this to report missing configuration."""
        return True

    @abstractmethod
    def iter_items(self) -> Iterator[RawItem]:
        """Yield raw items from the remote API. Must call `record_error` instead of raising
        for recoverable problems (e.g. one failing page) so partial results are kept."""

    @abstractmethod
    def to_raw_job(self, item: RawItem) -> dict[str, Any] | None:
        """Map one raw item to RawJob fields, or return None to skip an out-of-scope posting
        (outside Brazil, closed...). May raise KeyError/TypeError/ValueError."""

    def record_error(self, message: str) -> None:
        logger.warning("[%s] %s", self.name, message)
        self._errors.append(message)

    def fetch(self) -> FetchResult:
        result = FetchResult(source=self.name)
        seen: set[str] = set()
        self._errors = []

        for item in self.iter_items():
            result.received += 1
            try:
                fields = self.to_raw_job(item)
                if fields is None:
                    result.skipped += 1
                    continue
                job = RawJob.model_validate({"source": self.name, **fields})
            except (ValidationError, KeyError, TypeError, ValueError) as exc:
                result.invalid += 1
                logger.debug("[%s] discarding invalid item: %s", self.name, _describe(exc))
                continue
            if job.source_id in seen:
                result.duplicates += 1
                continue
            seen.add(job.source_id)
            result.jobs.append(job)

        result.errors = list(self._errors)
        logger.info(
            "[%s] received=%d valid=%d invalid=%d skipped=%d duplicates=%d errors=%d",
            self.name,
            result.received,
            len(result.jobs),
            result.invalid,
            result.skipped,
            result.duplicates,
            len(result.errors),
        )
        return result


def entry_level_hints(levels: Iterable[str | None]) -> list[str]:
    """Seniority tags are trusted only when unambiguous: a posting tagged both "Júnior" and
    "Sênior" (talent pools, mis-tagged ads) gives no level hint, and the title decides alone."""
    names = [level for level in levels if level]
    if any(_ABOVE_ENTRY_LEVEL.search(matching_form(name)) for name in names):
        return []
    return names


def _describe(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        # Field locations and messages only: never echo raw input values into logs.
        return "; ".join(
            f"{'.'.join(map(str, err['loc']))}: {err['msg']}"
            for err in exc.errors(include_input=False, include_url=False)
        )
    return f"{type(exc).__name__}: {exc}"
