"""Pure-ASGI middlewares: security headers + request id, and per-client rate limiting."""

from __future__ import annotations

import math
import re
import time
import uuid
from collections import OrderedDict, deque

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

_REQUEST_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")
DOCS_PREFIXES = ("/docs", "/redoc", "/openapi.json")


class SecurityHeadersMiddleware:
    """Adds hardening headers to every response and propagates an X-Request-ID."""

    def __init__(self, app: ASGIApp, *, hsts: bool = False) -> None:
        self.app = app
        self.headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "no-referrer",
            "Cross-Origin-Opener-Policy": "same-origin",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        }
        if hsts:
            self.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = Headers(scope=scope).get("x-request-id", "")
        # Only echo client-provided ids that are safe to put in logs/headers.
        request_id = incoming if _REQUEST_ID.fullmatch(incoming) else uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id
        is_docs = scope["path"].startswith(DOCS_PREFIXES)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in self.headers.items():
                    headers.setdefault(name, value)
                if not is_docs:  # Swagger UI needs scripts/styles; JSON endpoints need nothing.
                    headers.setdefault(
                        "Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'"
                    )
                headers["X-Request-ID"] = request_id
            await send(message)

        await self.app(scope, receive, send_with_headers)


class RateLimitMiddleware:
    """Sliding-window limiter keyed by client IP (in-memory, single process).

    Behind a reverse proxy, either configure uvicorn's --proxy-headers/--forwarded-allow-ips so
    that `scope["client"]` is the real client address, or pass `client_ip_header` when the proxy
    overwrites that header itself (Vercel's x-real-ip). For multiple instances use a shared store
    (e.g. Redis) or the gateway's own rate limiting instead.
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        limit: int,
        window_seconds: float = 60.0,
        max_tracked_clients: int = 10_000,
        exempt_paths: tuple[str, ...] = ("/health",),
        client_ip_header: str | None = None,
    ) -> None:
        self.app = app
        self.limit = limit
        self.window = window_seconds
        self.max_tracked_clients = max_tracked_clients
        self.exempt_paths = exempt_paths
        self.client_ip_header = client_ip_header
        self._hits: OrderedDict[str, deque[float]] = OrderedDict()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] == "OPTIONS"
            or scope["path"] in self.exempt_paths
        ):
            await self.app(scope, receive, send)
            return

        key = self._client_key(scope)
        now = time.monotonic()
        hits = self._hits.pop(key, None) or deque()
        while hits and hits[0] <= now - self.window:
            hits.popleft()

        if len(hits) >= self.limit:
            self._hits[key] = hits
            retry_after = max(1, math.ceil(self.window - (now - hits[0])))
            response = JSONResponse(
                {"detail": "Muitas requisições. Tente novamente em instantes."},
                status_code=429,
                headers={"Retry-After": str(retry_after)},
            )
            await response(scope, receive, send)
            return

        hits.append(now)
        self._hits[key] = hits  # re-inserted at the end: OrderedDict keeps LRU order
        while len(self._hits) > self.max_tracked_clients:
            self._hits.popitem(last=False)
        await self.app(scope, receive, send)

    def _client_key(self, scope: Scope) -> str:
        if self.client_ip_header:
            # X-Forwarded-For style lists start with the original client.
            value = Headers(scope=scope).get(self.client_ip_header, "").split(",")[0].strip()
            if value:
                return value
        client = scope.get("client")
        return client[0] if client else "unknown"
