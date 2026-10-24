from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from job_analyzer.analytics.trends import skill_trends
from job_analyzer.api.app import create_app
from job_analyzer.config import Settings
from job_analyzer.models import Area, Dataset, History, HistoryPoint, Level
from job_analyzer.storage import DataStore

FIRST_DAY = date(2026, 11, 1)


def _segment(level: Level, area: Area, jobs: int, skills: dict[str, int]) -> dict[str, Any]:
    return {"level": level, "area": area, "jobs": jobs, "skills": skills}


def _point(offset: int, *segments: dict[str, Any]) -> HistoryPoint:
    day = FIRST_DAY + timedelta(days=offset)
    return HistoryPoint.model_validate(
        {
            "day": day,
            "generated_at": datetime(day.year, day.month, day.day, 12, tzinfo=UTC),
            "segments": list(segments),
        }
    )


@pytest.fixture
def history() -> History:
    # SQL loses ground among interns while Python gains; Excel is only asked by Júnior jobs.
    return History(
        points=[
            _point(
                0,
                _segment(Level.ESTAGIO, Area.DADOS, 20, {"sql": 10, "python": 5}),
                _segment(Level.JUNIOR, Area.DADOS, 10, {"excel": 6}),
            ),
            _point(
                1,
                _segment(Level.ESTAGIO, Area.DADOS, 20, {"sql": 8, "python": 8}),
                _segment(Level.JUNIOR, Area.DADOS, 10, {"excel": 6}),
            ),
            _point(
                2,
                _segment(Level.ESTAGIO, Area.DADOS, 25, {"sql": 5, "python": 15, "unknown": 9}),
                _segment(Level.JUNIOR, Area.DADOS, 15, {"excel": 9}),
            ),
        ]
    )


def test_jobs_per_day_and_top_skills_of_the_last_day(history: History) -> None:
    trends = skill_trends(history, days=30, limit=5)

    assert [(day.day, day.jobs) for day in trends.days] == [
        (FIRST_DAY, 30),
        (FIRST_DAY + timedelta(days=1), 30),
        (FIRST_DAY + timedelta(days=2), 40),
    ]
    # Unknown slugs (taxonomy changes) are left out.
    assert [skill.slug for skill in trends.skills] == ["python", "excel", "sql"]
    python = trends.skills[0]
    assert [point.count for point in python.points] == [5, 8, 15]
    assert python.points[-1].share == pytest.approx(15 / 40)
    assert python.change == pytest.approx(round(15 / 40 - 5 / 30, 4))


def test_rising_and_falling_skills(history: History) -> None:
    trends = skill_trends(history, days=30, limit=5)
    assert [skill.slug for skill in trends.rising] == ["python", "excel"]
    assert [skill.slug for skill in trends.falling] == ["sql"]


def test_level_filter_and_window(history: History) -> None:
    junior = skill_trends(history, level=Level.JUNIOR, days=30, limit=5)
    assert [day.jobs for day in junior.days] == [10, 10, 15]
    assert [skill.slug for skill in junior.skills] == ["excel"]

    last_two = skill_trends(history, area=Area.DADOS, days=2, limit=1)
    assert [day.day for day in last_two.days] == [
        FIRST_DAY + timedelta(days=1),
        FIRST_DAY + timedelta(days=2),
    ]
    assert len(last_two.skills) == 1


def test_days_before_a_source_change_are_left_out(history: History) -> None:
    before = _point(-40, _segment(Level.ESTAGIO, Area.DADOS, 99, {"sql": 99}))
    trends = skill_trends(History(points=[before, *history.points]), days=365, limit=5)
    assert trends.days[0].day == FIRST_DAY
    assert skill_trends(History(points=[before]), days=365, limit=5).days == []


def test_movers_need_two_days_and_enough_jobs(history: History) -> None:
    one_day = skill_trends(History(points=history.points[:1]), days=30, limit=5)
    assert one_day.rising == one_day.falling == []
    assert skill_trends(History(), days=30, limit=5).days == []

    small = History(
        points=[
            _point(0, _segment(Level.ESTAGIO, Area.DADOS, 10, {"git": 1})),
            _point(1, _segment(Level.ESTAGIO, Area.DADOS, 10, {"git": 3})),
        ]
    )
    assert skill_trends(small, days=30, limit=5).rising == []


@pytest.fixture
def client(
    settings: Settings, store: DataStore, sample_dataset: Dataset, history: History
) -> Iterator[TestClient]:
    store.save_dataset(sample_dataset)
    store.save_history(history)
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def test_trends_endpoint(client: TestClient) -> None:
    body = client.get("/api/v1/trends", params={"level": "estagio", "limit": 2}).json()
    assert [day["jobs"] for day in body["days"]] == [20, 20, 25]
    assert [skill["slug"] for skill in body["skills"]] == ["python", "sql"]
    assert body["falling"][0]["slug"] == "sql"


@pytest.mark.parametrize(
    "query", ["state=SP", "days=1", "limit=0", "level=pleno", "workplace=remoto"]
)
def test_trends_rejects_filters_history_does_not_have(client: TestClient, query: str) -> None:
    assert client.get(f"/api/v1/trends?{query}").status_code == 422


def test_invalid_history_still_serves_the_dataset(
    settings: Settings, store: DataStore, sample_dataset: Dataset
) -> None:
    store.save_dataset(sample_dataset)
    store.history_path.write_text('{"points": "wrong"}', encoding="utf-8")
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/meta").status_code == 200
        assert client.get("/api/v1/trends").json()["days"] == []
