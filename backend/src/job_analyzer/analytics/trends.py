"""Trends over the daily history: open jobs per day and each skill's share of them.

history.json only keeps per-day counts by level x area (see job_analyzer.history), so trends can
be filtered by level and area, and nothing else.
"""

from __future__ import annotations

from collections import Counter
from datetime import date, timedelta

from job_analyzer.analytics.schemas import SkillTrend, TrendDay, TrendPoint, TrendsResponse
from job_analyzer.models import Area, History, Level
from job_analyzer.processing.skills import SKILLS_BY_SLUG

# Days collected with other sources or scope rules are not comparable: Remotar was retired on
# 2026-10-15 (a market drop that wasn't), and entry-level titles without "júnior" ("Assistente
# de TI", "Analista de Dados I") count from the 2026-10-26 collection (a jump that wasn't). Move
# this date when either changes.
COMPARABLE_SINCE = date(2026, 10, 26)
# A rule change confined to one area restarts that area only: Automação leaves out industrial
# automation (engineering degrees, plant technicians, PLCs) from the 2026-10-30 collection, which
# moved every other slice by less than MIN_MOVER_CHANGE.
COMPARABLE_SINCE_BY_AREA: dict[Area, date] = {Area.AUTOMACAO: date(2026, 10, 30)}
# Fewer comparable days than this show no movers: a few jobs coming and going from one day to the
# next is noise, not a trend.
MIN_TREND_DAYS = 7
# A skill moves the needle only if enough jobs ask for it (8 -> 6 jobs is not a trend) and its
# share moved by at least one percentage point.
MIN_MOVER_COUNT = 10
MIN_MOVER_CHANGE = 0.01
MAX_MOVERS = 5


def skill_trends(
    history: History,
    *,
    level: Level | None = None,
    area: Area | None = None,
    days: int,
    limit: int,
    min_days: int = MIN_TREND_DAYS,
) -> TrendsResponse:
    """The last `days` days of history (up to its newest point) for one level/area slice."""
    empty = TrendsResponse(days=[], skills=[], rising=[], falling=[], min_days=min_days)
    if not history.points:
        return empty
    since = COMPARABLE_SINCE_BY_AREA.get(area, COMPARABLE_SINCE) if area else COMPARABLE_SINCE
    start = max(history.points[-1].day - timedelta(days=days - 1), since)
    series: list[tuple[date, int, Counter[str]]] = []
    for point in history.points:
        if point.day < start:
            continue
        segments = [
            segment
            for segment in point.segments
            if (level is None or segment.level == level) and (area is None or segment.area == area)
        ]
        skills: Counter[str] = Counter()
        for segment in segments:
            skills.update(segment.skills)
        series.append((point.day, sum(segment.jobs for segment in segments), skills))
    if not series:
        return empty

    def trend(slug: str) -> SkillTrend:
        spec = SKILLS_BY_SLUG[slug]
        points = [
            TrendPoint(day=day, count=skills[slug], share=_share(skills[slug], jobs))
            for day, jobs, skills in series
        ]
        return SkillTrend(
            slug=spec.slug,
            name=spec.name,
            category=spec.category,
            points=points,
            change=round(points[-1].share - points[0].share, 4),
        )

    # Unknown slugs (the taxonomy changed after a day was recorded) are ignored.
    first, last = series[0][2], series[-1][2]
    top = sorted(
        (slug for slug in last if slug in SKILLS_BY_SLUG and last[slug] > 0),
        key=lambda slug: (-last[slug], SKILLS_BY_SLUG[slug].name),
    )[:limit]
    candidates = {
        slug
        for slug in first.keys() | last.keys()
        if slug in SKILLS_BY_SLUG and max(first[slug], last[slug]) >= MIN_MOVER_COUNT
    }
    movers = sorted(
        (trend(slug) for slug in candidates) if len(series) >= max(min_days, 2) else (),
        key=lambda item: (-item.change, item.name),
    )
    return TrendsResponse(
        days=[TrendDay(day=day, jobs=jobs) for day, jobs, _ in series],
        skills=[trend(slug) for slug in top],
        rising=[item for item in movers if item.change >= MIN_MOVER_CHANGE][:MAX_MOVERS],
        falling=[item for item in reversed(movers) if item.change <= -MIN_MOVER_CHANGE][
            :MAX_MOVERS
        ],
        min_days=min_days,
    )


def _share(count: int, total: int) -> float:
    return round(count / total, 4) if total else 0.0
