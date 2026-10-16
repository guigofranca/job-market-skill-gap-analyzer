"""Polite, resilient HTTP client shared by all job sources.

Features: explicit timeouts, retries with exponential backoff + jitter (honouring Retry-After),
a minimum delay between requests, a hard cap on response size and JSON content-type checks.
"""

from __future__ import annotations

import json
import logging
import random
import time
from collections.abc import Callable, Mapping
from types import TracebackType
from typing import Any, Self

import httpx

from job_analyzer import __version__
from job_analyzer.config import Settings
from job_analyzer.exceptions import SourceError
from job_analyzer.logging_config import redact_url

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})
MAX_BACKOFF_SECONDS = 60.0

QueryParams = Mapping[str, str | int]


class HttpClient:
    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._max_retries = settings.http_max_retries
        self._backoff = settings.http_backoff_seconds
        self._min_interval = settings.request_delay_seconds
        self._max_bytes = settings.http_max_response_mb * 1024 * 1024
        self._sleep = sleep
        self._last_request_at: float | None = None
        self._client = httpx.Client(
            timeout=httpx.Timeout(settings.http_timeout_seconds),
            headers={
                "User-Agent": f"{settings.http_user_agent} job-analyzer/{__version__}",
                "Accept": "application/json",
            },
            follow_redirects=True,
            max_redirects=5,
            transport=transport,
        )

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def get_json(self, url: str, params: QueryParams | None = None) -> Any:
        """GET a JSON document, retrying transient failures. Raises SourceError on failure."""
        request = self._client.build_request("GET", url, params=params)
        safe_url = redact_url(str(request.url))

        for attempt in range(self._max_retries + 1):
            self._throttle()
            try:
                response = self._client.send(request, stream=True)
            except httpx.HTTPError as exc:
                if attempt >= self._max_retries:
                    raise SourceError(
                        f"network error calling {safe_url}: {type(exc).__name__}"
                    ) from exc
                self._wait_before_retry(attempt, None, f"{type(exc).__name__}", safe_url)
                continue

            try:
                if response.status_code in RETRYABLE_STATUS and attempt < self._max_retries:
                    self._wait_before_retry(
                        attempt,
                        response.headers.get("Retry-After"),
                        str(response.status_code),
                        safe_url,
                    )
                    continue
                if response.is_error:
                    raise SourceError(f"HTTP {response.status_code} from {safe_url}")
                return self._decode_json(response, safe_url)
            finally:
                response.close()

        raise SourceError(
            f"giving up on {safe_url}"
        )  # pragma: no cover - loop always returns/raises

    # ------------------------------------------------------------------ internals
    def _decode_json(self, response: httpx.Response, safe_url: str) -> Any:
        content_type = response.headers.get("Content-Type", "")
        if "json" not in content_type.lower():
            raise SourceError(
                f"expected JSON from {safe_url}, got {content_type or 'no content-type'}"
            )

        declared = response.headers.get("Content-Length")
        if declared and declared.isdigit() and int(declared) > self._max_bytes:
            raise SourceError(f"response from {safe_url} exceeds {self._max_bytes} bytes")

        body = bytearray()
        for chunk in response.iter_bytes():
            body.extend(chunk)
            if len(body) > self._max_bytes:
                raise SourceError(f"response from {safe_url} exceeds {self._max_bytes} bytes")

        try:
            return json.loads(bytes(body))
        except ValueError as exc:
            raise SourceError(f"invalid JSON from {safe_url}") from exc

    def _throttle(self) -> None:
        if self._last_request_at is not None and self._min_interval > 0:
            elapsed = time.monotonic() - self._last_request_at
            if elapsed < self._min_interval:
                self._sleep(self._min_interval - elapsed)
        self._last_request_at = time.monotonic()

    def _wait_before_retry(
        self, attempt: int, retry_after: str | None, reason: str, safe_url: str
    ) -> None:
        if retry_after and retry_after.isdigit():
            delay = float(retry_after)
        else:
            jitter = random.uniform(0, self._backoff / 2)  # noqa: S311 - not used for security
            delay = self._backoff * (2**attempt) + jitter
        delay = min(delay, MAX_BACKOFF_SECONDS)
        logger.warning(
            "Transient failure (%s) on %s; retry %d/%d in %.1fs",
            reason,
            safe_url,
            attempt + 1,
            self._max_retries,
            delay,
        )
        self._sleep(delay)
