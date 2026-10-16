"""ETL orchestration: collect (extract) -> process (transform) -> dataset.json (load)."""

from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime

import numpy as np
import pandas as pd

from job_analyzer.config import Settings
from job_analyzer.exceptions import DatasetNotFoundError
from job_analyzer.http_client import HttpClient
from job_analyzer.models import (
    Affirmative,
    Benefit,
    Dataset,
    DatasetMetadata,
    Level,
    ProcessedJob,
    RawJob,
    RawSnapshot,
    Requirements,
    SourceName,
    SourceStats,
)
from job_analyzer.processing.attributes import (
    detect_affirmative,
    detect_workplace,
    is_pcd_friendly,
    ordered,
    resolve_contracts,
)
from job_analyzer.processing.benefits import extract_benefits
from job_analyzer.processing.classification import classify_area, classify_level
from job_analyzer.processing.cleaning import clean_jobs, jobs_to_frame
from job_analyzer.processing.eligibility import extract_requirements
from job_analyzer.processing.sections import split_requirements
from job_analyzer.processing.skills import SkillExtractor
from job_analyzer.processing.text import matching_form
from job_analyzer.sources import build_sources
from job_analyzer.storage import DataStore

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class CollectionReport:
    source: SourceName
    received: int
    valid: int
    invalid: int
    errors: tuple[str, ...]
    snapshot_saved: bool


def make_store(settings: Settings) -> DataStore:
    return DataStore(settings.data_dir, max_file_bytes=settings.max_data_file_mb * 1024 * 1024)


def collect(
    settings: Settings,
    store: DataStore,
    *,
    sources: Iterable[SourceName] | None = None,
    http: HttpClient | None = None,
) -> list[CollectionReport]:
    """Fetch every enabled source. A failing source never prevents the others from running."""
    reports: list[CollectionReport] = []
    client = http or HttpClient(settings)
    try:
        for source in build_sources(settings, client, sources):
            try:
                result = source.fetch()
            except Exception as exc:
                logger.exception("Source %s failed unexpectedly", source.name.value)
                reports.append(
                    CollectionReport(
                        source.name, 0, 0, 0, (f"unexpected error: {type(exc).__name__}",), False
                    )
                )
                continue

            saved = False
            if result.jobs:
                snapshot = RawSnapshot(
                    source=result.source,
                    collected_at=datetime.now(UTC),
                    partial=not result.ok,
                    jobs=result.jobs,
                )
                store.save_raw_snapshot(snapshot)
                saved = True
            reports.append(
                CollectionReport(
                    source=result.source,
                    received=result.received,
                    valid=len(result.jobs),
                    invalid=result.invalid,
                    errors=tuple(result.errors),
                    snapshot_saved=saved,
                )
            )
    finally:
        if http is None:
            client.close()
    return reports


JobKey = tuple[str, str]


@dataclass(frozen=True, slots=True)
class RawHistory:
    """The postings still listed by each source, plus when each posting was first collected."""

    jobs: list[RawJob]
    first_seen: dict[JobKey, datetime]
    delisted: int


def job_key(job: RawJob) -> JobKey:
    return (job.source.value, job.source_id)


def merge_snapshots(snapshots_by_source: Iterable[Iterable[RawSnapshot]]) -> RawHistory:
    """`snapshots_by_source` yields, per source, its snapshots from newest to oldest.

    A posting is open while its source still lists it: the newest snapshot defines what is open.
    When that snapshot is partial (some requests failed), older ones are added until a complete
    one, so a failed page never hides open jobs. Older snapshots only date each posting.
    """
    jobs: list[RawJob] = []
    listed: set[JobKey] = set()
    first_seen: dict[JobKey, datetime] = {}
    for snapshots in snapshots_by_source:
        current = True
        for snapshot in snapshots:
            for job in snapshot.jobs:
                key = job_key(job)
                first_seen[key] = min(
                    first_seen.get(key, snapshot.collected_at), snapshot.collected_at
                )
                if current and key not in listed:
                    listed.add(key)
                    jobs.append(job)
            current = current and snapshot.partial
    return RawHistory(jobs=jobs, first_seen=first_seen, delisted=len(first_seen) - len(listed))


def load_raw_jobs(settings: Settings, store: DataStore) -> RawHistory:
    limit = settings.max_raw_snapshots_per_source
    return merge_snapshots(store.iter_raw_snapshots(source, limit=limit) for source in SourceName)


def build_dataset(
    raw_jobs: list[RawJob],
    *,
    max_age_days: int,
    now: datetime | None = None,
    first_seen: Mapping[JobKey, datetime] | None = None,
    delisted: int = 0,
) -> Dataset:
    """Pure transformation (no I/O): raw jobs -> cleaned, classified, skill-tagged dataset."""
    now = now or datetime.now(UTC)
    cleaned, stats = clean_jobs(jobs_to_frame(raw_jobs), max_age_days=max_age_days, now=now)
    stats.delisted = delisted
    seen = first_seen or {}
    cleaned["first_seen"] = [
        seen.get((str(source), str(source_id)))
        for source, source_id in zip(cleaned["source"], cleaned["source_id"], strict=True)
    ]

    # Level first: it only needs the title, and filtering early means the (comparatively
    # expensive) skill extraction runs on in-scope postings only.
    cleaned["level"] = [
        classify_level(title, hints)
        for title, hints in zip(cleaned["title"], cleaned["hints"], strict=True)
    ]
    in_level = cleaned["level"].notna()
    stats.out_of_scope_level = int((~in_level).sum())
    cleaned = cleaned[in_level].copy()
    _resolve_attributes(cleaned)

    _read_descriptions(cleaned, today=now.date())
    cleaned["area"] = [
        classify_area(title, [*skills, *nice])
        for title, skills, nice in zip(
            cleaned["title"], cleaned["skills"], cleaned["nice_to_have"], strict=True
        )
    ]
    in_area = cleaned["area"].notna()
    stats.out_of_scope_area = int((~in_area).sum())
    cleaned = cleaned[in_area]
    stats.kept = len(cleaned)

    jobs = [ProcessedJob.model_validate(record) for record in _to_records(cleaned)]
    raw_counts = pd.Series([job.source for job in raw_jobs], dtype="object").value_counts()
    kept_counts = pd.Series([job.source for job in jobs], dtype="object").value_counts()
    sources = {
        source: SourceStats(
            raw=int(raw_counts.get(source, 0)), kept=int(kept_counts.get(source, 0))
        )
        for source in SourceName
        if raw_counts.get(source, 0)
    }
    metadata = DatasetMetadata(
        generated_at=now, max_job_age_days=max_age_days, stats=stats, sources=sources
    )
    return Dataset(metadata=metadata, jobs=jobs)


def process(settings: Settings, store: DataStore) -> Dataset:
    history = load_raw_jobs(settings, store)
    if not history.jobs:
        raise DatasetNotFoundError("no raw snapshots found; run `job-analyzer collect` first")
    dataset = build_dataset(
        history.jobs,
        max_age_days=settings.max_job_age_days,
        first_seen=history.first_seen,
        delisted=history.delisted,
    )
    store.save_dataset(dataset)
    return dataset


def _read_descriptions(jobs: pd.DataFrame, *, today: date) -> None:
    """Required skills (requirements, responsibilities, the title), the ones listed only as a
    plus ("diferencial", "desejável") and who can apply (course, semester, English...).
    Company and benefits text is ignored (see sections.py); the benefits themselves become tags
    (see benefits.py)."""
    extractor = SkillExtractor()
    required: list[list[str]] = []
    nice_to_have: list[list[str]] = []
    requirements: list[Requirements] = []
    benefits: list[list[Benefit]] = []
    for title, description, level in zip(
        jobs["title"], jobs["description_lines"], jobs["level"], strict=True
    ):
        required_text, nice_text = split_requirements(title, description)
        skills = extractor.extract(required_text)
        required.append(skills)
        nice_to_have.append([slug for slug in extractor.extract(nice_text) if slug not in skills])
        found = extract_requirements(
            required_text, nice_text, matching_form(description), today=today
        )
        if level == Level.ESTAGIO and found.degree_required:
            # An internship requires being enrolled (Lei 11.788/2008): "completo" is a typo.
            found = found.model_copy(update={"degree_required": False})
        requirements.append(found)
        benefits.append(extract_benefits(description))
    jobs["skills"] = required
    jobs["nice_to_have"] = nice_to_have
    jobs["requirements"] = pd.Series(requirements, index=jobs.index, dtype="object")
    jobs["benefits"] = benefits


def _resolve_attributes(jobs: pd.DataFrame) -> None:
    """Workplace, contract and inclusion: source fields first, text rules for the gaps."""
    jobs["workplace"] = [
        source if isinstance(source, str) else detect_workplace(title, location)
        for source, title, location in zip(
            jobs["workplace"], jobs["title_match"], jobs["location"], strict=True
        )
    ]
    jobs["contracts"] = [
        resolve_contracts(source or (), text, level)
        for source, text, level in zip(
            jobs["contracts"], jobs["match_text"], jobs["level"], strict=True
        )
    ]
    jobs["affirmative"] = [
        ordered({*(source or ()), *detect_affirmative(title, text)})
        for source, title, text in zip(
            jobs["affirmative"], jobs["title_match"], jobs["match_text"], strict=True
        )
    ]
    jobs["accepts_pcd"] = [
        _is_true(source) or Affirmative.PCD in groups or is_pcd_friendly(text)
        for source, groups, text in zip(
            jobs["accepts_pcd"], jobs["affirmative"], jobs["match_text"], strict=True
        )
    ]


def _is_true(value: object) -> bool:
    """True for Python and NumPy booleans alike; missing values (None/NaN) are False."""
    return isinstance(value, bool | np.bool_) and bool(value)


def _to_records(frame: pd.DataFrame) -> list[dict[str, object]]:
    columns = [
        "id",
        "source",
        "title",
        "company",
        "location",
        "url",
        "published_at",
        "level",
        "area",
        "city",
        "state",
        "workplace",
        "contracts",
        "affirmative",
        "accepts_pcd",
        "salary_min",
        "salary_max",
        "deadline",
        "first_seen",
        "requirements",
        "skills",
        "nice_to_have",
        "benefits",
    ]
    records: list[dict[str, object]] = []
    for row in frame[columns].itertuples(index=False):
        record = dict(zip(columns, row, strict=True))
        published = record["published_at"]
        record["published_at"] = published.date() if isinstance(published, pd.Timestamp) else None
        for key in (
            "company",
            "location",
            "city",
            "state",
            "workplace",
            "salary_min",
            "salary_max",
            "deadline",
            "first_seen",
        ):
            if pd.isna(record[key]):
                record[key] = None
        records.append(record)
    return records
