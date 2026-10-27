"""The MCP server at /mcp: its tools answer with the same data as the REST API, and it refuses
what it must (unknown arguments, other origins and hosts, GET streams, oversized bodies)."""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from job_analyzer.api.app import create_app
from job_analyzer.api.mcp_server import MAX_REQUEST_BODY_BYTES
from job_analyzer.config import Settings
from job_analyzer.models import Dataset, RawJob
from job_analyzer.pipeline import build_dataset
from job_analyzer.storage import DataStore

from .conftest import NOW, RawJobFactory

HEADERS = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": "2025-11-25",
}
TOOLS = {"list_filters", "search_jobs", "analyze_profile", "top_skills", "compare_levels"}
PROFILE = ["python", "sql", "excel", "power-bi", "git"]


@pytest.fixture
def client(settings: Settings, store: DataStore, sample_dataset: Dataset) -> Iterator[TestClient]:
    store.save_dataset(sample_dataset)
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def rpc(
    client: TestClient, method: str, params: dict[str, Any] | None = None, **headers: str
) -> Any:
    body: dict[str, Any] = {"jsonrpc": "2.0", "id": 1, "method": method}
    if params is not None:
        body["params"] = params
    return client.post("/mcp", json=body, headers={**HEADERS, **headers})


def call(client: TestClient, name: str, **arguments: Any) -> dict[str, Any]:
    response = rpc(client, "tools/call", {"name": name, "arguments": arguments})
    assert response.status_code == 200
    result: dict[str, Any] = response.json()["result"]
    return result


def test_initialize_describes_the_server(client: TestClient) -> None:
    client_info = {"name": "pytest", "version": "1"}
    hello = {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": client_info}
    result = rpc(client, "initialize", hello).json()["result"]
    assert result["serverInfo"]["name"] == "empregos-e-tendencias"
    assert "list_filters" in result["instructions"]


def test_tools_are_listed_as_read_only(client: TestClient) -> None:
    tools = rpc(client, "tools/list").json()["result"]["tools"]
    assert {tool["name"] for tool in tools} == TOOLS
    for tool in tools:
        assert tool["annotations"]["readOnlyHint"] is True
        assert tool["annotations"]["destructiveHint"] is False
        assert tool["outputSchema"]["type"] == "object"


def test_analyze_profile_gives_the_same_answers_as_the_rest_api(client: TestClient) -> None:
    result = call(client, "analyze_profile", skills=PROFILE, area="dados", missing=1)
    assert result["isError"] is False
    matches = result["structuredContent"]["matches"]
    assert (matches["total_jobs"], matches["ready"], matches["one_away"]) == (28, 14, 14)
    assert matches["items"][0]["missing"] == ["english"]

    known = ",".join(PROFILE)
    rest = client.get(
        "/api/v1/jobs/matches", params={"known": known, "area": "dados", "missing": 1}
    )
    assert matches["items"] == rest.json()["items"]
    gap = client.get("/api/v1/skills/gap", params={"known": known, "area": "dados"})
    assert result["structuredContent"]["learn_next"] == gap.json()


def test_the_model_reads_compact_json_without_empty_fields(client: TestClient) -> None:
    result = call(client, "search_jobs", skill="react", limit=3)
    text = result["content"][0]["text"]
    data = json.loads(text)
    assert text == json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    assert "null" not in text
    assert (data["total"], len(data["items"])) == (14, 3)
    # The typed copy for the client application keeps every field.
    assert result["structuredContent"]["items"][0]["salary_min"] is None


def test_list_filters_gives_cities_of_the_requested_state_only(
    settings: Settings, store: DataStore, raw_job: RawJobFactory, sample_raw_jobs: list[RawJob]
) -> None:
    located = [raw_job(city="Niterói", state="RJ"), raw_job(city="São Paulo", state="SP")]
    store.save_dataset(build_dataset([*sample_raw_jobs, *located], max_age_days=180, now=NOW))
    with TestClient(create_app(settings)) as client:
        everything = call(client, "list_filters")["structuredContent"]
        rio = call(client, "list_filters", state="rj")["structuredContent"]

    assert everything["total_jobs"] == 44
    counts = [skill["count"] for skill in everything["skills"]]
    assert counts == sorted(counts, reverse=True)  # most requested first
    assert {state["key"] for state in everything["states"]} == {"RJ", "SP"}
    assert everything["cities"] == []  # only asked for one state at a time
    assert [(city["label"], city["state"]) for city in rio["cities"]] == [("Niterói", "RJ")]


def test_market_tools(client: TestClient) -> None:
    top = call(client, "top_skills", level="estagio", limit=2)["structuredContent"]
    assert top["total_jobs"] == 14
    assert len(top["items"]) == 2

    comparison = call(client, "compare_levels", area="dados")["structuredContent"]
    assert comparison["totals"] == {"estagio": 14, "junior": 14}


@pytest.mark.parametrize(
    ("tool", "arguments"),
    [
        ("search_jobs", {"limit": 26}),
        ("search_jobs", {"offset": -1}),
        ("search_jobs", {"skill": "not-a-skill"}),
        ("search_jobs", {"level": "senior"}),
        ("search_jobs", {"state": "XX"}),
        ("search_jobs", {"city": "../../etc"}),
        ("search_jobs", {"title": "x" * 81}),
        ("analyze_profile", {}),
        ("analyze_profile", {"skills": []}),
        ("analyze_profile", {"skills": ["python"] * 61}),
        ("analyze_profile", {"skills": ["python"], "missing": 21}),
        ("top_skills", {"limit": 51}),
        ("compare_levels", {"limit": 0}),
    ],
)
def test_invalid_arguments_are_tool_errors(
    client: TestClient, tool: str, arguments: dict[str, Any]
) -> None:
    assert call(client, tool, **arguments)["isError"] is True


def test_unknown_argument_names_are_refused(client: TestClient) -> None:
    # Ignoring it would answer as if the filter had been applied.
    result = call(client, "search_jobs", skils="python")
    assert result["isError"] is True
    text = result["content"][0]["text"]
    assert "skill" in text  # lists the valid names...
    assert "skils" not in text  # ...and never echoes the ones sent


def test_unknown_tool_is_an_error(client: TestClient) -> None:
    assert call(client, "drop_everything")["isError"] is True


def test_only_post_is_served(client: TestClient) -> None:
    # A GET would open an event stream that a stateless server never writes to.
    assert client.get("/mcp", headers=HEADERS).status_code == 405
    assert client.delete("/mcp", headers=HEADERS).status_code == 405


def test_browser_pages_of_other_origins_are_refused(client: TestClient) -> None:
    assert rpc(client, "tools/list", Origin="https://evil.example").status_code == 403
    assert rpc(client, "tools/list", Origin="http://localhost:5173").status_code == 200


def test_untrusted_host_is_refused(client: TestClient) -> None:
    assert rpc(client, "tools/list", Host="evil.example").status_code == 400


def test_oversized_and_malformed_bodies_are_refused(client: TestClient) -> None:
    big = {"name": "search_jobs", "arguments": {"title": "x" * MAX_REQUEST_BODY_BYTES}}
    assert rpc(client, "tools/call", big).status_code == 413

    malformed = client.post("/mcp", content=b"{not json", headers=HEADERS)
    assert malformed.status_code == 400
    assert malformed.json()["error"]["code"] == -32700


def test_responses_are_not_cached_and_carry_security_headers(client: TestClient) -> None:
    response = rpc(client, "tools/list")
    assert "Vercel-CDN-Cache-Control" not in response.headers
    assert (
        response.headers["Content-Security-Policy"] == "default-src 'none'; frame-ancestors 'none'"
    )
    assert response.headers["X-Content-Type-Options"] == "nosniff"


def test_rate_limit_applies(settings: Settings, store: DataStore, sample_dataset: Dataset) -> None:
    store.save_dataset(sample_dataset)
    limited = settings.model_copy(update={"api_rate_limit_per_minute": 3})
    with TestClient(create_app(limited)) as client:
        statuses = [rpc(client, "tools/list").status_code for _ in range(4)]
    assert statuses == [200, 200, 200, 429]


def test_missing_data_is_reported_as_a_tool_error(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        result = call(client, "list_filters")
    assert result["isError"] is True
    assert "unavailable" in result["content"][0]["text"]


def test_mcp_can_be_turned_off(
    settings: Settings, store: DataStore, sample_dataset: Dataset
) -> None:
    store.save_dataset(sample_dataset)
    off = settings.model_copy(update={"api_enable_mcp": False})
    with TestClient(create_app(off)) as client:
        assert rpc(client, "tools/list").status_code == 404
        assert client.get("/api/v1/meta").status_code == 200
