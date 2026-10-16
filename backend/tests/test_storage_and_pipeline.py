from __future__ import annotations

from datetime import timedelta

import httpx
import pytest

from job_analyzer.config import Settings
from job_analyzer.exceptions import DatasetNotFoundError, DataValidationError
from job_analyzer.http_client import HttpClient
from job_analyzer.models import Area, Dataset, Level, RawJob, RawSnapshot, SourceName
from job_analyzer.pipeline import build_dataset, collect, job_key, merge_snapshots, process
from job_analyzer.storage import DataStore

from .conftest import NOW, RawJobFactory


def test_snapshot_round_trip(store: DataStore, raw_job: RawJobFactory) -> None:
    snapshot = RawSnapshot(source=SourceName.GUPY, collected_at=NOW, jobs=[raw_job()])
    path = store.save_raw_snapshot(snapshot)
    assert path.parent.name == "gupy"
    assert list(store.iter_raw_snapshots(SourceName.GUPY, limit=10)) == [snapshot]
    assert not list(path.parent.glob("*.tmp"))  # atomic write left no temp files


def test_corrupt_and_oversized_files_are_skipped(store: DataStore, raw_job: RawJobFactory) -> None:
    store.save_raw_snapshot(RawSnapshot(source=SourceName.GUPY, collected_at=NOW, jobs=[raw_job()]))
    folder = store.base_dir / "raw" / "gupy"
    (folder / "20990101T000000Z.json").write_text("{not json", encoding="utf-8")
    (folder / "20990102T000000Z.json").write_text('{"jobs": "wrong"}', encoding="utf-8")
    (folder / "20990103T000000Z.json").write_bytes(b" " * (store.max_file_bytes + 1))
    assert len(list(store.iter_raw_snapshots(SourceName.GUPY, limit=10))) == 1


def test_paths_cannot_escape_the_data_directory(store: DataStore) -> None:
    with pytest.raises(DataValidationError):
        store._safe_path("..", "..", "etc", "passwd")


def test_invalid_dataset_file_is_rejected(store: DataStore) -> None:
    with pytest.raises(DatasetNotFoundError):
        store.load_dataset()
    store.dataset_path.parent.mkdir(parents=True)
    store.dataset_path.write_text('{"metadata": {}, "jobs": []}', encoding="utf-8")
    with pytest.raises(DataValidationError):
        store.load_dataset()


def test_build_dataset_cleans_classifies_and_extracts(sample_dataset: Dataset) -> None:
    jobs = sample_dataset.jobs
    stats = sample_dataset.metadata.stats
    assert stats.raw_records == 44
    assert stats.out_of_scope_level == 1  # "Sênior"
    assert stats.out_of_scope_area == 1  # "Marketing"
    assert stats.kept == len(jobs) == 42

    intern = next(job for job in jobs if job.title == "Estágio em Dados")
    assert (intern.level, intern.area) == (Level.ESTAGIO, Area.DADOS)
    assert {"python", "sql", "excel", "power-bi"} <= set(intern.skills)
    # "Diferencial: Docker" is a plus, not a requirement.
    assert intern.nice_to_have == ["docker"]
    assert "docker" not in intern.skills
    assert all(job.published_at is not None for job in jobs)


def test_duplicates_and_stale_jobs_are_removed(raw_job: RawJobFactory) -> None:
    original = raw_job(description="Python")
    same_id = raw_job(source_id=original.source_id, description="Python")
    same_text_other_city = raw_job(company=original.company, description="Python", location="RJ")
    stale = raw_job(published_at=NOW - timedelta(days=400))
    dataset = build_dataset(
        [original, same_id, same_text_other_city, stale], max_age_days=180, now=NOW
    )
    assert dataset.metadata.stats.duplicates == 2
    assert dataset.metadata.stats.too_old == 1
    assert len(dataset.jobs) == 1


def test_process_requires_raw_data(settings: Settings, store: DataStore) -> None:
    with pytest.raises(DatasetNotFoundError):
        process(settings, store)


def test_collect_isolates_failing_sources(settings: Settings, store: DataStore) -> None:
    settings = settings.model_copy(
        update={
            "gupy_search_terms": ["dados"],
            "enabled_sources": [SourceName.GUPY, SourceName.SOLIDES],
            "solides_max_pages_per_query": 1,
        }
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if "gupy" in request.url.host:
            return httpx.Response(503)
        return httpx.Response(
            200,
            json={
                "data": [
                    {
                        "id": 7,
                        "title": "Junior Data Analyst",
                        "description": "SQL",
                        "currentState": "em_andamento",
                        "createdAt": NOW.date().isoformat(),
                        "seniority": [{"name": "Junior"}],
                    }
                ],
                "totalPages": 1,
            },
        )

    with HttpClient(settings, transport=httpx.MockTransport(handler), sleep=lambda _: None) as http:
        reports = collect(settings, store, http=http)

    by_source = {report.source: report for report in reports}
    assert by_source[SourceName.GUPY].errors
    assert not by_source[SourceName.GUPY].snapshot_saved
    assert by_source[SourceName.SOLIDES].snapshot_saved
    dataset = process(settings, store)
    assert [job.title for job in dataset.jobs] == ["Junior Data Analyst"]
    assert store.load_dataset() == dataset


def test_raw_job_rejects_unsafe_or_malformed_values(raw_job: RawJobFactory) -> None:
    for bad in ({"url": "javascript:alert(1)"}, {"title": ""}, {"source_id": "x" * 200}):
        with pytest.raises(ValueError, match="validation error"):
            raw_job(**bad)
    future = raw_job(published_at=NOW + timedelta(days=3650))
    assert future.published_at is None
    long_text = raw_job(description="a" * 80_000)
    assert len(long_text.description) == 50_000
    assert isinstance(long_text, RawJob)


def test_only_postings_still_listed_are_open(raw_job: RawJobFactory) -> None:
    kept, closed, new = raw_job(), raw_job(), raw_job()
    older = RawSnapshot(
        source=SourceName.GUPY, collected_at=NOW - timedelta(days=2), jobs=[kept, closed]
    )
    newest = RawSnapshot(source=SourceName.GUPY, collected_at=NOW, jobs=[kept, new])
    history = merge_snapshots([[newest, older]])

    assert [job.source_id for job in history.jobs] == [kept.source_id, new.source_id]
    assert history.delisted == 1
    # Dated by the first collection that found it, not by the latest one.
    assert history.first_seen[job_key(kept)] == NOW - timedelta(days=2)
    assert history.first_seen[job_key(new)] == NOW

    dataset = build_dataset(
        history.jobs, max_age_days=180, now=NOW, first_seen=history.first_seen, delisted=1
    )
    assert dataset.metadata.stats.delisted == 1
    assert {job.first_seen for job in dataset.jobs} == {NOW - timedelta(days=2), NOW}


def test_partial_snapshot_does_not_hide_open_postings(raw_job: RawJobFactory) -> None:
    first, second = raw_job(), raw_job()
    complete = RawSnapshot(
        source=SourceName.GUPY, collected_at=NOW - timedelta(days=1), jobs=[first, second]
    )
    # A page failed in the newest run: "second" was not fetched, but it is not closed.
    partial = RawSnapshot(source=SourceName.GUPY, collected_at=NOW, partial=True, jobs=[first])
    history = merge_snapshots([[partial, complete]])
    assert {job.source_id for job in history.jobs} == {first.source_id, second.source_id}
    assert history.delisted == 0


def test_collect_marks_snapshots_with_failed_requests(settings: Settings, store: DataStore) -> None:
    settings = settings.model_copy(
        update={"enabled_sources": [SourceName.SOLIDES], "solides_max_pages_per_query": 2}
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.params.get("page") == "2":
            return httpx.Response(503)
        job = {"id": 1, "title": "Junior Dev", "description": "Python", "currentState": None}
        return httpx.Response(200, json={"data": [job], "totalPages": 2})

    with HttpClient(settings, transport=httpx.MockTransport(handler), sleep=lambda _: None) as http:
        collect(settings, store, http=http)
    [snapshot] = store.iter_raw_snapshots(SourceName.SOLIDES, limit=1)
    assert snapshot.partial
