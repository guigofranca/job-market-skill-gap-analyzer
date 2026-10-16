from __future__ import annotations

import re
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from job_analyzer.api.app import create_app
from job_analyzer.config import Environment, Settings
from job_analyzer.models import Dataset
from job_analyzer.processing.skills import TAXONOMY
from job_analyzer.storage import DataStore


@pytest.fixture
def client(settings: Settings, store: DataStore, sample_dataset: Dataset) -> Iterator[TestClient]:
    store.save_dataset(sample_dataset)
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def test_health_and_meta(client: TestClient) -> None:
    health = client.get("/health").json()
    assert health["status"] == "ok"
    assert health["total_jobs"] == 42

    meta = client.get("/api/v1/meta").json()
    assert meta["total_jobs"] == 42
    assert {level["key"] for level in meta["levels"]} == {"estagio", "junior"}
    assert meta["skills"][0]["slug"] == "git"


def test_filtered_endpoints(client: TestClient) -> None:
    top = client.get("/api/v1/skills/top", params={"level": "estagio", "limit": 2}).json()
    assert top["total_jobs"] == 14
    assert len(top["items"]) == 2

    gap = client.get("/api/v1/skills/gap?known=python&known=sql&area=dados").json()
    assert gap["total_jobs"] == 28

    matches = client.get(
        "/api/v1/jobs/matches",
        params={"known": "python,sql,excel,power-bi,git", "area": "dados", "missing": 1},
    ).json()
    assert (matches["total_jobs"], matches["ready"], matches["one_away"]) == (28, 14, 14)
    assert matches["items"][0]["missing"] == ["english"]
    searched = client.get(
        "/api/v1/jobs/matches", params={"known": "python", "q": "front-end"}
    ).json()
    assert searched["total_jobs"] == 14  # title search applies to the ranked list too

    jobs = client.get("/api/v1/jobs", params={"skill": "react", "limit": 3}).json()
    assert jobs["total"] == 14
    assert len(jobs["items"]) == 3

    since = {"since": "2026-10-01T09:00:00-03:00"}
    assert client.get("/api/v1/jobs", params=since).status_code == 200
    assert client.get("/api/v1/jobs/matches", params={**since, "known": "sql"}).status_code == 200
    profile = {"semester": 3, "course": "ads", "english": "basico", "hide_ineligible": "true"}
    response = client.get("/api/v1/jobs", params=profile)
    assert response.status_code == 200
    assert {"total", "ineligible"} <= response.json().keys()
    matches = client.get("/api/v1/jobs/matches", params={**profile, "known": "sql"})
    assert matches.status_code == 200
    comparison = client.get("/api/v1/skills/compare-levels", params={"area": "dados"}).json()
    assert comparison["totals"] == {"estagio": 14, "junior": 14}
    locations = client.get("/api/v1/locations", params={"limit": 3}).json()
    assert locations["kind"] == "state"
    assert client.get("/api/v1/locations", params={"limit": 31}).status_code == 422
    workplaces = client.get("/api/v1/workplaces", params={"area": "dados"}).json()
    assert workplaces["items"][0]["total"] == 42


@pytest.mark.parametrize(
    "url",
    [
        "/api/v1/skills/top?level=senior",
        "/api/v1/skills/top?skill=cobol",
        "/api/v1/skills/top?limit=500",
        "/api/v1/skills/top?unexpected=1",
        "/api/v1/jobs?offset=-1",
        "/api/v1/jobs?q=" + "x" * 81,
        "/api/v1/skills/gap",
        "/api/v1/jobs/matches",
        "/api/v1/summary?state=XX",
        "/api/v1/summary?state=Sao Paulo",
        "/api/v1/summary?city=../../etc/passwd",
        "/api/v1/summary?workplace=lua",
        "/api/v1/summary?inclusion=todos",
        "/api/v1/skills/compare-levels?state=XX",
        "/api/v1/jobs/matches?known=python&missing=21",
        "/api/v1/jobs/matches?known=python&limit=51",
        "/api/v1/jobs?since=ontem",
        "/api/v1/jobs?course=area-exatas",  # a group, not a course
        "/api/v1/jobs?ids=not-an-id",
        "/api/v1/jobs?course=medicina",
        "/api/v1/jobs?semester=13",
        "/api/v1/jobs?graduation=2028-13",
        "/api/v1/jobs/matches?known=python&english=nativo",
        "/api/v1/jobs?since=2026-10-01T00:00:00",  # no timezone: ambiguous
    ],
)
def test_invalid_parameters_are_rejected(client: TestClient, url: str) -> None:
    response = client.get(url)
    assert response.status_code == 422
    body = response.json()
    assert body["detail"] == "Parâmetros inválidos."
    assert all(set(error) == {"loc", "msg"} for error in body["errors"])
    assert "cobol" not in response.text  # user input is never reflected


def test_location_and_inclusion_filters_are_accepted(client: TestClient) -> None:
    params = {
        "state": "sp",  # normalised to "SP"
        "city": "sp-sao-paulo",
        "workplace": "remoto",
        "inclusion": "aceita-pcd",
    }
    for path in ("/api/v1/summary", "/api/v1/jobs", "/api/v1/skills/top"):
        assert client.get(path, params=params).status_code == 200
    comparison = client.get("/api/v1/skills/compare-levels", params={"state": "SP"})
    assert comparison.status_code == 200

    meta = client.get("/api/v1/meta").json()
    assert {"states", "cities", "workplaces", "inclusion"} <= meta.keys()


def test_only_get_is_allowed(client: TestClient) -> None:
    assert client.post("/api/v1/meta").status_code == 405


def test_security_headers_and_request_id(client: TestClient) -> None:
    response = client.get("/api/v1/meta", headers={"X-Request-ID": "abc12345-test"})
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert "default-src 'none'" in response.headers["Content-Security-Policy"]
    assert response.headers["X-Request-ID"] == "abc12345-test"
    injected = client.get("/health", headers={"X-Request-ID": "bad id\nwith newline"})
    assert injected.headers["X-Request-ID"] != "bad id\nwith newline"


def test_cors_allows_only_configured_origins(client: TestClient) -> None:
    allowed = client.get("/api/v1/meta", headers={"Origin": "http://localhost:5173"})
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    denied = client.get("/api/v1/meta", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in denied.headers


def test_untrusted_host_is_rejected(client: TestClient) -> None:
    assert client.get("/health", headers={"Host": "evil.example"}).status_code == 400


def test_returns_503_without_dataset(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        assert client.get("/health").json()["status"] == "degraded"
        response = client.get("/api/v1/meta")
        assert response.status_code == 503
        assert "job-analyzer run" in response.json()["detail"]


def test_rate_limit(settings: Settings, store: DataStore, sample_dataset: Dataset) -> None:
    store.save_dataset(sample_dataset)
    limited = settings.model_copy(update={"api_rate_limit_per_minute": 3})
    with TestClient(create_app(limited)) as client:
        statuses = [client.get("/api/v1/meta").status_code for _ in range(4)]
        assert statuses == [200, 200, 200, 429]
        assert int(client.get("/api/v1/meta").headers["Retry-After"]) >= 1
        assert client.get("/health").status_code == 200  # health checks are exempt


def test_rate_limit_by_proxy_header(
    settings: Settings, store: DataStore, sample_dataset: Dataset
) -> None:
    store.save_dataset(sample_dataset)

    def statuses(app_settings: Settings) -> list[int]:
        with TestClient(create_app(app_settings)) as client:
            return [
                client.get("/api/v1/meta", headers={"X-Real-IP": ip}).status_code
                for ip in ("203.0.113.1", "203.0.113.1", "203.0.113.2")
            ]

    limited = settings.model_copy(update={"api_rate_limit_per_minute": 1})
    # Ignored unless configured: a client could otherwise pick a fresh IP for every request.
    assert statuses(limited) == [200, 429, 429]
    trusted = limited.model_copy(update={"api_client_ip_header": "x-real-ip"})
    assert statuses(trusted) == [200, 429, 200]


def test_docs_are_disabled_in_production(settings: Settings) -> None:
    production = settings.model_copy(update={"environment": Environment.PRODUCTION})
    with TestClient(create_app(production)) as client:
        assert client.get("/docs").status_code == 404
        assert client.get("/openapi.json").status_code == 404
        assert "Strict-Transport-Security" in client.get("/health").headers


def test_skill_patterns_are_browser_compatible(client: TestClient) -> None:
    items = client.get("/api/v1/skills/patterns").json()["items"]
    assert {item["slug"] for item in items} == {spec.slug for spec in TAXONOMY}
    for item in items:
        # Only syntax every current JavaScript engine accepts: no inline flags or named groups.
        assert not re.search(r"\(\?(?![:=!]|<[=!])", item["pattern"]), item["slug"]

    def finds(slug: str, text: str) -> bool:
        return any(
            re.search(item["pattern"], text, re.IGNORECASE if item["ignore_case"] else 0)
            for item in items
            if item["slug"] == slug
        )

    assert finds("go", "Python, Go e SQL")
    assert finds("go", "experiência com GOLANG")
    assert not finds("go", "go to market")
    assert finds("ai", "IA generativa")
    # Case-sensitive part: the Portuguese verb "ia" is not AI.
    assert not finds("ai", "ele ia ao escritorio")


def test_jobs_can_be_looked_up_by_id(client: TestClient) -> None:
    listed = client.get("/api/v1/jobs", params={"limit": 3}).json()["items"]
    ids = [item["id"] for item in listed]
    unknown = "f" * 16  # closed or removed: simply absent from the answer
    found = client.get("/api/v1/jobs", params={"ids": ",".join([*ids, unknown])}).json()
    assert {item["id"] for item in found["items"]} == set(ids)
    too_many = ",".join(f"{n:016x}" for n in range(201))
    assert client.get("/api/v1/jobs", params={"ids": too_many}).status_code == 422
    assert client.get("/api/v1/jobs", params={"exclude": too_many}).status_code == 422


def test_opened_jobs_can_be_hidden_or_listed_alone(client: TestClient) -> None:
    every = client.get("/api/v1/jobs", params={"limit": 50}).json()
    opened = [item["id"] for item in every["items"][:2]]
    hidden = client.get("/api/v1/jobs", params={"limit": 50, "exclude": ",".join(opened)}).json()
    assert hidden["total"] == every["total"] - 2
    assert not {item["id"] for item in hidden["items"]} & set(opened)

    params = {"known": "sql", "limit": 50}
    ranked = client.get("/api/v1/jobs/matches", params=params).json()
    only = client.get("/api/v1/jobs/matches", params={**params, "ids": ",".join(opened)}).json()
    assert {item["id"] for item in only["items"]} <= set(opened)
    without = client.get(
        "/api/v1/jobs/matches", params={**params, "exclude": ",".join(opened)}
    ).json()
    assert without["total"] + only["total"] == ranked["total"]
