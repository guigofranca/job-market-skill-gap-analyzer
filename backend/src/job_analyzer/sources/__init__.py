"""Job source registry. To add a source: subclass JobSource, then register it here."""

from __future__ import annotations

import logging
from collections.abc import Iterable

from job_analyzer.config import Settings
from job_analyzer.http_client import HttpClient
from job_analyzer.models import SourceName
from job_analyzer.sources.base import FetchResult, JobSource
from job_analyzer.sources.gupy import GupySource
from job_analyzer.sources.solides import SolidesSource

logger = logging.getLogger(__name__)

SOURCE_REGISTRY: dict[SourceName, type[JobSource]] = {
    SourceName.GUPY: GupySource,
    SourceName.SOLIDES: SolidesSource,
}

SOURCE_LABELS: dict[str, str] = {name: cls.label for name, cls in SOURCE_REGISTRY.items()}


def build_sources(
    settings: Settings, http: HttpClient, names: Iterable[SourceName] | None = None
) -> list[JobSource]:
    """Instantiate the requested sources, skipping (with a warning) those missing configuration."""
    sources: list[JobSource] = []
    for name in dict.fromkeys(names or settings.enabled_sources):
        source_cls = SOURCE_REGISTRY[name]
        if not source_cls.is_configured(settings):
            logger.warning("Source %r is enabled but not configured; skipping it.", name.value)
            continue
        sources.append(source_cls(settings, http))
    return sources


__all__ = ["SOURCE_LABELS", "SOURCE_REGISTRY", "FetchResult", "JobSource", "build_sources"]
