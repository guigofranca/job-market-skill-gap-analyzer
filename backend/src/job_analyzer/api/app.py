"""FastAPI application factory.

Run with:  job-analyzer serve   (or)   uvicorn job_analyzer.api.app:create_app --factory
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from job_analyzer import __version__
from job_analyzer.analytics import DatasetRepository
from job_analyzer.api.errors import register_exception_handlers
from job_analyzer.api.middleware import RateLimitMiddleware, SecurityHeadersMiddleware
from job_analyzer.api.routes import health_router, router
from job_analyzer.config import Environment, Settings, get_settings
from job_analyzer.logging_config import configure_logging
from job_analyzer.pipeline import make_store

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        repository = DatasetRepository(make_store(settings))
        repository.refresh()
        if repository.last_error:
            logger.warning("API started without data: %s", repository.last_error)
        app.state.repository = repository
        yield

    docs = settings.docs_enabled
    app = FastAPI(
        title="Job Market Skill Gap Analyzer API",
        version=__version__,
        description="Competências mais exigidas em vagas de Estágio e Júnior "
        "(Dados, Automação e Desenvolvimento), a partir de vagas reais.",
        docs_url="/docs" if docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs else None,
        lifespan=lifespan,
    )

    # Starlette runs the last-added middleware first. Effective order for a request:
    # SecurityHeaders -> CORS -> TrustedHost -> RateLimit -> GZip -> routes
    # (CORS sits outside the limiter so that 429 responses are still readable by the browser).
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(RateLimitMiddleware, limit=settings.api_rate_limit_per_minute)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.api_allowed_hosts)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.api_cors_origins,
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["Accept", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID", "Retry-After"],
        max_age=600,
    )
    app.add_middleware(
        SecurityHeadersMiddleware, hsts=settings.environment is Environment.PRODUCTION
    )

    register_exception_handlers(app)
    app.include_router(health_router)
    app.include_router(router)
    return app
