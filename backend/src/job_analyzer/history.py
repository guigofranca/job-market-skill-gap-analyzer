"""Daily history: a small per-day aggregate of the dataset, so trends survive each new collection.

dataset.json only holds the postings open today; history.json keeps, per day, how many jobs each
level x area segment had and how many of them required each skill.
"""

from __future__ import annotations

from collections import Counter, defaultdict

from job_analyzer.brazil import BRASILIA
from job_analyzer.models import (
    Area,
    Dataset,
    History,
    HistoryPoint,
    HistorySegment,
    Level,
    ProcessedJob,
)


def history_point(dataset: Dataset) -> HistoryPoint:
    groups: defaultdict[tuple[Level, Area], list[ProcessedJob]] = defaultdict(list)
    for job in dataset.jobs:
        groups[(job.level, job.area)].append(job)

    segments = []
    for (level, area), jobs in sorted(groups.items()):
        workplace = Counter(job.workplace for job in jobs if job.workplace is not None)
        skills = Counter(slug for job in jobs for slug in job.skills)
        segments.append(
            HistorySegment(
                level=level,
                area=area,
                jobs=len(jobs),
                workplace=dict(sorted(workplace.items())),
                skills=dict(sorted(skills.items())),
            )
        )
    generated_at = dataset.metadata.generated_at
    return HistoryPoint(
        day=generated_at.astimezone(BRASILIA).date(),
        generated_at=generated_at,
        segments=segments,
    )


def add_point(history: History, point: HistoryPoint) -> History:
    """Add `point`, replacing an earlier one from the same day (the newest run wins)."""
    points = [existing for existing in history.points if existing.day != point.day]
    points.append(point)
    points.sort(key=lambda existing: existing.day)
    return History(points=points)
