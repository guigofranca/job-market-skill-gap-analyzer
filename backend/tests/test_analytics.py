from __future__ import annotations

from datetime import timedelta

import pytest

from job_analyzer.analytics import JobFilters, SkillAnalytics
from job_analyzer.analytics.schemas import Conflict
from job_analyzer.analytics.service import Candidate, search_form
from job_analyzer.models import Area, Dataset, EnglishLevel, Level, RawJob, Workplace
from job_analyzer.pipeline import build_dataset, job_key

from .conftest import NOW, RawJobFactory


@pytest.fixture
def analytics(sample_dataset: Dataset) -> SkillAnalytics:
    return SkillAnalytics(sample_dataset)


def test_summary_counts(analytics: SkillAnalytics) -> None:
    summary = analytics.summary(JobFilters())
    assert summary.total_jobs == 42
    assert {option.key: option.count for option in summary.by_level} == {
        "estagio": 14,
        "junior": 28,
    }
    assert {option.key: option.count for option in summary.by_area}["desenvolvimento"] == 14
    assert summary.jobs_without_skills == 0


def test_top_skills_are_ranked_with_stable_ties(analytics: SkillAnalytics) -> None:
    top = analytics.top_skills(JobFilters(), limit=4)
    assert [item.slug for item in top.items] == ["git", "power-bi", "python", "sql"]
    assert top.items[0].count == 28
    assert top.items[0].share == pytest.approx(28 / 42, abs=1e-4)


def test_filters_combine(analytics: SkillAnalytics) -> None:
    top = analytics.top_skills(JobFilters(level=Level.ESTAGIO, area=Area.DADOS), limit=10)
    assert top.total_jobs == 14
    assert {item.slug for item in top.items} == {"python", "sql", "excel", "power-bi"}
    assert all(item.share == 1.0 for item in top.items)


def test_skill_filter_returns_co_occurring_skills(analytics: SkillAnalytics) -> None:
    related = analytics.top_skills(JobFilters(skill="react"), limit=10)
    assert related.total_jobs == 14
    assert "react" not in {item.slug for item in related.items}
    assert {"typescript", "html", "css", "git"} <= {item.slug for item in related.items}


def test_compare_levels(analytics: SkillAnalytics) -> None:
    comparison = analytics.compare_levels(JobFilters(), limit=10)
    assert comparison.totals == {Level.ESTAGIO: 14, Level.JUNIOR: 28}
    python = next(item for item in comparison.items if item.slug == "python")
    assert (python.estagio_share, python.junior_share) == (1.0, 0.5)


def test_locations_rank_states_then_cities(raw_job: RawJobFactory) -> None:
    def job(city: str | None, state: str | None, **overrides: object) -> RawJob:
        return raw_job(
            title="Analista de Dados Júnior", description="SQL", city=city, state=state, **overrides
        )

    jobs = [job("Campinas", "SP"), job("Campinas", "SP"), job("Santos", "SP"), job(None, "SP")]
    jobs += [job("Belo Horizonte", "MG")]
    jobs += [job(None, None, location=None, workplace=Workplace.REMOTO)]
    analytics = SkillAnalytics(build_dataset(jobs, max_age_days=180, now=NOW))

    states = analytics.locations(JobFilters(), limit=10)
    assert (states.kind, states.total_jobs, states.unlocated) == ("state", 6, 1)
    assert [(item.key, item.count) for item in states.items] == [("SP", 4), ("MG", 1)]
    assert states.items[0].label == "São Paulo"
    assert states.items[0].share == round(4 / 6, 4)
    assert len(analytics.locations(JobFilters(), limit=1).items) == 1

    # A selected state lists its cities; the city filter is ignored (the chart compares them).
    cities = analytics.locations(JobFilters(state="SP", city="sp-santos"), limit=10)
    assert (cities.kind, cities.total_jobs, cities.unlocated) == ("city", 4, 1)
    assert [(item.key, item.count) for item in cities.items] == [
        ("sp-campinas", 2),
        ("sp-santos", 1),
    ]


def test_workplaces_by_area(raw_job: RawJobFactory) -> None:
    def dados(workplace: Workplace) -> RawJob:
        return raw_job(title="Analista de Dados Júnior", description="SQL", workplace=workplace)

    def dev(**overrides: object) -> RawJob:
        return raw_job(title="Desenvolvedor Júnior", description="Java", **overrides)

    jobs = [*(dados(Workplace.REMOTO) for _ in range(3)), dados(Workplace.HIBRIDO)]
    jobs += [dev(workplace=Workplace.PRESENCIAL), dev(location=None)]
    analytics = SkillAnalytics(build_dataset(jobs, max_age_days=180, now=NOW))

    # Area and workplace filters are ignored: the chart compares them.
    result = analytics.workplaces(JobFilters(area=Area.DADOS, workplace=Workplace.REMOTO))
    everything, first, second = result.items
    assert (everything.area, everything.total, everything.unknown) == (None, 6, 1)
    assert [item.count for item in everything.workplaces] == [3, 1, 1]
    # Shares are among the jobs that say where work happens; the most remote area comes first.
    assert (first.area, [item.share for item in first.workplaces]) == (Area.DADOS, [0.75, 0.25, 0])
    assert (second.area, second.unknown, second.workplaces[2].share) == (
        Area.DESENVOLVIMENTO,
        1,
        1.0,
    )
    assert analytics.workplaces(JobFilters(level=Level.ESTAGIO)).items == []


def test_gap_coverage_and_recommendations(analytics: SkillAnalytics) -> None:
    gap = analytics.gap(JobFilters(), known=["python", "sql"], limit=5)
    assert gap.total_jobs == 42
    # estágio: 2/4, júnior dados: 2/5, front-end: 0/5
    assert gap.avg_coverage == pytest.approx((14 * 0.5 + 14 * 0.4) / 42, abs=1e-4)
    assert gap.half_covered == 14
    assert gap.fully_covered == 0
    assert [item.slug for item in gap.recommendations[:2]] == ["git", "power-bi"]
    assert {item.slug for item in gap.known} == {"python", "sql"}


def test_gap_unlocks_counts_jobs_missing_a_single_skill(analytics: SkillAnalytics) -> None:
    gap = analytics.gap(JobFilters(level=Level.ESTAGIO), known=["python", "sql", "excel"], limit=5)
    power_bi = next(item for item in gap.recommendations if item.slug == "power-bi")
    assert power_bi.unlocks == 14


# Sample profiles: estágio = {python, sql, excel, power-bi}; júnior dados = {sql, power-bi,
# python, english, git}; front-end = {react, typescript, html, css, git}. 14 jobs each.
DATA_PROFILE = ["python", "sql", "excel", "power-bi", "git"]


def test_matches_put_ready_jobs_first(analytics: SkillAnalytics) -> None:
    result = analytics.matches(JobFilters(), known=DATA_PROFILE, missing=None, limit=50, offset=0)
    assert (result.total_jobs, result.ready, result.one_away, result.total) == (42, 14, 14, 42)
    first, middle, last = result.items[0], result.items[14], result.items[-1]
    assert (first.level, first.missing, first.coverage) == (Level.ESTAGIO, [], 1.0)
    # "Diferencial: Docker" is shown, but a plus never counts as missing.
    assert first.nice_to_have == ["docker"]
    assert (middle.title, middle.missing, middle.coverage) == (
        "Analista de Dados Júnior",
        ["english"],
        0.8,
    )
    assert last.matched == ["git"]
    assert last.coverage == pytest.approx(0.2)


def test_matches_filter_by_missing_count_and_paginate(analytics: SkillAnalytics) -> None:
    one_away = analytics.matches(JobFilters(), known=DATA_PROFILE, missing=1, limit=5, offset=10)
    assert one_away.total == 14
    assert len(one_away.items) == 4
    assert all(item.missing == ["english"] for item in one_away.items)
    # The summary counts do not depend on the `missing` filter (they label the tabs).
    assert (one_away.ready, one_away.one_away) == (14, 14)


def test_matches_break_ties_by_matched_skills_then_date(analytics: SkillAnalytics) -> None:
    everything = [*DATA_PROFILE, "english", "react", "typescript", "html", "css"]
    result = analytics.matches(JobFilters(), known=everything, missing=0, limit=50, offset=0)
    assert result.ready == result.total == 42
    # 5 of 5 skills is stronger evidence than 4 of 4: the estágio postings come last.
    assert {item.level for item in result.items[:28]} == {Level.JUNIOR}
    assert {item.level for item in result.items[28:]} == {Level.ESTAGIO}
    dates = [item.published_at for item in result.items[28:]]
    assert dates == sorted(dates, reverse=True)


def test_matches_list_missing_skills_by_market_demand(analytics: SkillAnalytics) -> None:
    result = analytics.matches(
        JobFilters(level=Level.ESTAGIO), known=["git"], missing=None, limit=1, offset=0
    )
    # python, sql and power-bi appear in 28 jobs, excel in 14; ties are alphabetical.
    assert result.items[0].missing == ["power-bi", "python", "sql", "excel"]
    assert result.items[0].matched == []


def test_list_jobs_paginates_and_searches(analytics: SkillAnalytics) -> None:
    page = analytics.list_jobs(JobFilters(), limit=5, offset=40)
    assert (page.total, len(page.items)) == (42, 2)
    dates = [
        job.published_at for job in analytics.list_jobs(JobFilters(), limit=42, offset=0).items
    ]
    assert dates == sorted(dates, reverse=True)
    assert analytics.list_jobs(JobFilters(query="front-END"), limit=50, offset=0).total == 14
    # Regex metacharacters are matched literally.
    assert analytics.list_jobs(JobFilters(query="(.*"), limit=50, offset=0).total == 0


@pytest.mark.parametrize("query", ["estagio", "ESTÁGIO", "Estágio  em", "estágio em dados"])
def test_title_search_ignores_accents_case_and_spacing(
    analytics: SkillAnalytics, query: str
) -> None:
    # The sample has 14 "Estágio em Dados" postings.
    assert analytics.list_jobs(JobFilters(query=query), limit=50, offset=0).total == 14


def test_title_search_matches_accented_queries_against_plain_titles(
    analytics: SkillAnalytics,
) -> None:
    # Both júnior titles of the sample (14 + 14) are found with or without the accent.
    for query in ("junior", "júnior", "JÚNIOR"):
        assert analytics.list_jobs(JobFilters(query=query), limit=50, offset=0).total == 28


@pytest.mark.parametrize(
    ("title", "query"),
    [
        ("Estagiário(a) de Dados", "estagio"),
        ("ESTAGIÁRIA - QA", "estagio"),
        ("Estágio em Dados", "estagiário"),
        ("Desenvolvedor Jr. Python", "junior"),
        ("Analista de Dados Júnior", "jr"),
    ],
)
def test_title_search_unifies_level_synonyms(title: str, query: str) -> None:
    assert search_form(query) in search_form(title)


def test_empty_filter_result(analytics: SkillAnalytics) -> None:
    filters = JobFilters(level=Level.ESTAGIO, area=Area.AUTOMACAO)
    assert analytics.summary(filters).total_jobs == 0
    assert analytics.top_skills(filters, limit=5).items == []
    assert analytics.gap(filters, known=["python"], limit=5).total_jobs == 0
    assert analytics.matches(filters, known=["python"], missing=None, limit=5, offset=0).total == 0


def test_since_keeps_jobs_first_collected_afterwards(sample_raw_jobs: list[RawJob]) -> None:
    yesterday, today = NOW - timedelta(days=1), NOW
    first_seen = {
        job_key(job): today if i < 3 else yesterday for i, job in enumerate(sample_raw_jobs)
    }
    dataset = build_dataset(sample_raw_jobs, max_age_days=180, now=NOW, first_seen=first_seen)
    analytics = SkillAnalytics(dataset)

    new = analytics.list_jobs(JobFilters(since=NOW - timedelta(hours=1)), limit=50, offset=0)
    assert new.total == 3
    assert all(item.first_seen == today for item in new.items)
    # Two days back: everything was found afterwards, but only fresh finds (published at most 3
    # days before being found: today's and 3-day-old postings) are news; the rest are weeks old.
    recent = analytics.list_jobs(JobFilters(since=NOW - timedelta(days=2)), limit=50, offset=0)
    assert recent.total == 6
    matches = analytics.matches(
        JobFilters(since=NOW - timedelta(hours=1)),
        known=["python"],
        missing=None,
        limit=5,
        offset=0,
    )
    assert matches.total_jobs == 3


def test_profile_conflicts_rank_last_or_are_hidden(raw_job: RawJobFactory) -> None:
    open_to_students = raw_job(
        title="Analista de Dados Júnior", description="Requisitos: SQL e Python.", hints=[]
    )
    graduates_only = raw_job(
        title="Analista de BI Júnior",
        description="Requisitos: SQL e Python; Ensino superior completo.",
        hints=[],
        published_at=NOW,  # newest: would come first without a profile
    )
    english = raw_job(
        title="Analista de Sistemas Júnior",
        description="Requisitos: SQL; Python; Inglês avançado.",
        hints=[],
    )
    analytics = SkillAnalytics(
        build_dataset([open_to_students, graduates_only, english], max_age_days=180, now=NOW)
    )
    student = Candidate(semester=5, english=EnglishLevel.INTERMEDIARIO)

    ranked = analytics.matches(
        JobFilters(), known=["sql", "python"], missing=None, limit=10, offset=0, candidate=student
    )
    assert ranked.ineligible == 2
    assert ranked.items[0].title == "Analista de Dados Júnior"
    conflicts_by_title = {item.title: item.conflicts for item in ranked.items}
    assert conflicts_by_title["Analista de BI Júnior"] == [Conflict.SUPERIOR_COMPLETO]
    assert conflicts_by_title["Analista de Sistemas Júnior"] == [Conflict.INGLES]
    # A stated English level counts as knowing English: it is not listed as missing.
    assert all("english" not in item.missing for item in ranked.items)

    hidden = analytics.list_jobs(
        JobFilters(), limit=10, offset=0, candidate=student, hide_ineligible=True
    )
    assert (hidden.total, hidden.ineligible) == (1, 2)
    assert analytics.list_jobs(JobFilters(), limit=10, offset=0).ineligible == 0


def test_old_postings_that_just_entered_the_data_are_not_new(raw_job: RawJobFactory) -> None:
    fresh = raw_job(title="Analista de Dados Júnior", hints=[], published_at=NOW)
    old = raw_job(title="Analista de BI Júnior", hints=[], published_at=NOW - timedelta(days=20))
    undated = raw_job(title="Desenvolvedor Júnior", hints=[], published_at=None)
    jobs = [fresh, old, undated]
    # All three were collected for the first time today (e.g. a new search term).
    first_seen = {job_key(job): NOW for job in jobs}
    dataset = build_dataset(jobs, max_age_days=180, now=NOW, first_seen=first_seen)
    analytics = SkillAnalytics(dataset)

    new = analytics.list_jobs(JobFilters(since=NOW - timedelta(days=2)), limit=10, offset=0)
    assert {item.title for item in new.items} == {
        "Analista de Dados Júnior",
        "Desenvolvedor Júnior",
    }


def test_jobs_whose_deadline_passed_after_the_collection_are_hidden(
    raw_job: RawJobFactory,
) -> None:
    today = NOW.date()
    jobs = [
        raw_job(title="Estágio em Dados", hints=[], deadline=today + timedelta(days=2)),
        raw_job(title="Estágio em BI", hints=[], deadline=today),
        raw_job(title="Desenvolvedor Júnior", hints=[], deadline=None),
    ]
    dataset = build_dataset(jobs, max_age_days=180, now=NOW)
    # A job stays open through its deadline day and closes the day after.
    assert SkillAnalytics(dataset, today=lambda: today).meta().total_jobs == 3
    next_day = SkillAnalytics(dataset, today=lambda: today + timedelta(days=1))
    assert next_day.meta().total_jobs == 2

    after = SkillAnalytics(dataset, today=lambda: today + timedelta(days=3))
    listed = after.list_jobs(JobFilters(), limit=10, offset=0)
    assert {item.title for item in listed.items} == {"Desenvolvedor Júnior"}
    assert after.meta().total_jobs == 1
    assert after.summary(JobFilters()).total_jobs == 1
