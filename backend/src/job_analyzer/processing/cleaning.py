"""Pandas cleaning stage: normalise text fields, drop stale records and remove duplicates."""

from __future__ import annotations

import hashlib
from collections.abc import Iterable
from datetime import UTC, date, datetime, timedelta

import pandas as pd

from job_analyzer.models import ProcessingStats, RawJob
from job_analyzer.processing.text import clean_inline, html_to_text, matching_form

CLEAN_COLUMNS = [
    "id",
    "source",
    "source_id",
    "title",
    "company",
    "location",
    "url",
    "published_at",
    "city",
    "state",
    "workplace",
    "contracts",
    "affirmative",
    "accepts_pcd",
    "salary_min",
    "salary_max",
    "deadline",
    "hints",
    "title_match",
    "match_text",
    "description_lines",
]


def jobs_to_frame(jobs: Iterable[RawJob]) -> pd.DataFrame:
    records = [job.model_dump(mode="python") for job in jobs]
    frame = pd.DataFrame.from_records(records, columns=list(RawJob.model_fields))
    frame["url"] = frame["url"].astype(str)
    return frame


def stable_job_id(source: str, source_id: str) -> str:
    """Deterministic, opaque id (the same posting keeps its id across pipeline runs)."""
    return hashlib.sha256(f"{source}:{source_id}".encode()).hexdigest()[:16]


def clean_jobs(
    frame: pd.DataFrame, *, max_age_days: int, now: datetime | None = None
) -> tuple[pd.DataFrame, ProcessingStats]:
    """Return a cleaned copy of `frame` plus counters describing what was removed."""
    stats = ProcessingStats(raw_records=len(frame))
    if frame.empty:
        return pd.DataFrame(columns=CLEAN_COLUMNS), stats

    df = frame.copy()
    df["title"] = df["title"].map(clean_inline)
    df["company"] = df["company"].map(lambda value: clean_inline(value, 200))
    df["location"] = df["location"].map(lambda value: clean_inline(value, 200))
    df["city"] = df["city"].map(lambda value: clean_inline(value, 100))
    df["description_text"] = df["description"].map(html_to_text)

    has_title = df["title"].notna()
    stats.empty_title = int((~has_title).sum())
    df = df[has_title]

    # Undated postings are kept (they still say what the market asks for), stale ones are not.
    df["published_at"] = pd.to_datetime(df["published_at"], utc=True, errors="coerce")
    cutoff = (now or datetime.now(UTC)) - timedelta(days=max_age_days)
    stale = df["published_at"].notna() & (df["published_at"] < cutoff)
    stats.too_old = int(stale.sum())
    df = df[~stale]

    # Past the application deadline: the job is closed, showing it would waste people's time.
    today = (now or datetime.now(UTC)).date()
    expired = df["deadline"].map(lambda deadline: isinstance(deadline, date) and deadline < today)
    stats.expired = int(expired.sum())
    df = df[~expired.astype(bool)]

    # Most recent first, so drop_duplicates keeps the freshest copy of each posting.
    df = df.sort_values("published_at", ascending=False, na_position="last", kind="stable")
    before = len(df)
    df = df.drop_duplicates(subset=["source", "source_id"], keep="first")
    # The same ad is often re-published (or cross-posted to several cities) with identical text:
    # count it once so a single employer cannot inflate a skill's demand.
    df["dedupe_key"] = (
        df["title"].str.casefold().str.replace(r"\W+", " ", regex=True).str.strip()
        + "|"
        + df["company"].fillna("").str.casefold()
        + "|"
        + df["description_text"].map(_text_fingerprint)
    )
    df = df.drop_duplicates(subset=["dedupe_key"], keep="first")
    stats.duplicates = before - len(df)

    df["id"] = [
        stable_job_id(str(s), str(i)) for s, i in zip(df["source"], df["source_id"], strict=True)
    ]
    df["match_text"] = (df["title"] + "\n" + df["description_text"]).map(matching_form)
    df["title_match"] = df["title"].map(matching_form)
    # Line breaks kept: section detection ("Requisitos" vs "Diferenciais") needs them.
    df["description_lines"] = df["description"].map(
        lambda value: html_to_text(value, keep_lines=True)
    )
    df["hints"] = df["hints"].map(lambda hints: list(hints) if hints is not None else [])

    stats.kept = len(df)
    return df[CLEAN_COLUMNS].reset_index(drop=True), stats


def _text_fingerprint(text: str) -> str:
    normalized = " ".join(matching_form(text).casefold().split())
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]
