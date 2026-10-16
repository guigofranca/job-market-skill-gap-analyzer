from __future__ import annotations

import httpx
import pytest

from job_analyzer.config import Settings
from job_analyzer.exceptions import SourceError
from job_analyzer.http_client import HttpClient

URL = "https://api.example.com/jobs"


def make_client(
    settings: Settings, handler: httpx.MockTransport, sleeps: list[float]
) -> HttpClient:
    return HttpClient(settings, transport=handler, sleep=sleeps.append)


def test_retries_transient_errors_then_succeeds(settings: Settings) -> None:
    responses = iter(
        [
            httpx.Response(503),
            httpx.Response(429, headers={"Retry-After": "2"}),
            httpx.Response(200, json={"ok": True}),
        ]
    )
    sleeps: list[float] = []
    with make_client(settings, httpx.MockTransport(lambda _: next(responses)), sleeps) as client:
        assert client.get_json(URL) == {"ok": True}
    assert 2.0 in sleeps  # Retry-After was honoured


def test_gives_up_after_max_retries(settings: Settings) -> None:
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(500)

    with (
        make_client(settings, httpx.MockTransport(handler), []) as client,
        pytest.raises(SourceError, match="HTTP 500"),
    ):
        client.get_json(URL)
    assert calls == settings.http_max_retries + 1


def test_client_errors_are_not_retried(settings: Settings) -> None:
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(404)

    with (
        make_client(settings, httpx.MockTransport(handler), []) as client,
        pytest.raises(SourceError),
    ):
        client.get_json(URL)
    assert calls == 1


def test_network_errors_become_source_errors(settings: Settings) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    with (
        make_client(settings, httpx.MockTransport(handler), []) as client,
        pytest.raises(SourceError, match="network error"),
    ):
        client.get_json(URL)


def test_rejects_non_json_and_invalid_json(settings: Settings) -> None:
    html = httpx.MockTransport(lambda _: httpx.Response(200, text="<html></html>"))
    with (
        make_client(settings, html, []) as client,
        pytest.raises(SourceError, match="expected JSON"),
    ):
        client.get_json(URL)

    broken = httpx.MockTransport(
        lambda _: httpx.Response(
            200, content=b"{oops", headers={"Content-Type": "application/json"}
        )
    )
    with (
        make_client(settings, broken, []) as client,
        pytest.raises(SourceError, match="invalid JSON"),
    ):
        client.get_json(URL)


def test_enforces_response_size_limit(settings: Settings) -> None:
    small = settings.model_copy(update={"http_max_response_mb": 1})
    big_body = b'{"data": "' + b"x" * (2 * 1024 * 1024) + b'"}'
    transport = httpx.MockTransport(
        lambda _: httpx.Response(
            200, content=big_body, headers={"Content-Type": "application/json"}
        )
    )
    with make_client(small, transport, []) as client, pytest.raises(SourceError, match="exceeds"):
        client.get_json(URL)


def test_error_messages_never_contain_credentials(settings: Settings) -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(401))
    with make_client(settings, transport, []) as client, pytest.raises(SourceError) as excinfo:
        client.get_json(URL, params={"app_id": "my-id", "app_key": "super-secret"})
    message = str(excinfo.value)
    assert "super-secret" not in message
    assert "my-id" not in message
    assert "app_key=***" in message
