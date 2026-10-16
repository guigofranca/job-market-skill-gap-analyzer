from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest

from job_analyzer.cli import main
from job_analyzer.config import Settings
from job_analyzer.exceptions import DataValidationError
from job_analyzer.history import add_point, history_point
from job_analyzer.models import Area, Dataset, History, HistoryPoint, Level, Workplace
from job_analyzer.storage import DataStore


def test_point_counts_jobs_and_required_skills_per_segment(sample_dataset: Dataset) -> None:
    point = history_point(sample_dataset)
    segments = {(segment.level, segment.area): segment for segment in point.segments}

    assert sum(segment.jobs for segment in point.segments) == len(sample_dataset.jobs)
    interns = [
        job for job in sample_dataset.jobs if (job.level, job.area) == (Level.ESTAGIO, Area.DADOS)
    ]
    segment = segments[(Level.ESTAGIO, Area.DADOS)]
    assert segment.jobs == len(interns)
    assert segment.skills["python"] == sum("python" in job.skills for job in interns)
    # Nice-to-have skills ("Diferencial: Docker") are not demand.
    assert "docker" not in segment.skills
    assert sum(segment.workplace.values()) == sum(job.workplace is not None for job in interns)


def test_day_is_the_collection_day_in_brasilia(sample_dataset: Dataset) -> None:
    # 01:30 UTC is still the previous evening in Brasília.
    late = sample_dataset.model_copy(deep=True)
    late.metadata.generated_at = datetime(2026, 10, 2, 1, 30, tzinfo=UTC)
    assert history_point(late).day == date(2026, 10, 1)


def _point(day: date, jobs: int = 1) -> HistoryPoint:
    return HistoryPoint.model_validate(
        {
            "day": day,
            "generated_at": datetime(day.year, day.month, day.day, 12, tzinfo=UTC),
            "segments": [
                {
                    "level": Level.JUNIOR,
                    "area": Area.DADOS,
                    "jobs": jobs,
                    "workplace": {Workplace.REMOTO: jobs},
                    "skills": {"sql": jobs},
                }
            ],
        }
    )


def test_add_point_keeps_one_point_per_day_in_order() -> None:
    first, second = date(2026, 10, 1), date(2026, 10, 2)
    history = add_point(add_point(History(), _point(second)), _point(first))
    assert [point.day for point in history.points] == [first, second]

    rerun = add_point(history, _point(second, jobs=5))
    assert [point.day for point in rerun.points] == [first, second]
    assert rerun.points[-1].segments[0].jobs == 5


def test_history_rejects_unordered_or_repeated_days() -> None:
    day = date(2026, 10, 1)
    for days in ([day, day], [day + timedelta(days=1), day]):
        with pytest.raises(ValueError, match="one per day"):
            History(points=[_point(d) for d in days])


def test_history_round_trip_and_invalid_file(store: DataStore) -> None:
    assert store.load_history() == History()
    history = History(points=[_point(date(2026, 10, 1))])
    store.save_history(history)
    assert store.load_history() == history

    store.history_path.write_text('{"points": "wrong"}', encoding="utf-8")
    with pytest.raises(DataValidationError):
        store.load_history()


def test_cli_records_the_current_dataset(
    settings: Settings,
    store: DataStore,
    sample_dataset: Dataset,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setattr("job_analyzer.cli.get_settings", lambda: settings)
    store.save_dataset(sample_dataset)

    assert main(["history"]) == 0
    assert main(["history"]) == 0  # same day again: replaced, not duplicated
    [point] = store.load_history().points
    assert point == history_point(sample_dataset)
    assert "1 dia(s)" in capsys.readouterr().out
