"""Exception handlers: consistent JSON errors that never leak stack traces or internals."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from job_analyzer.exceptions import DatasetUnavailableError

logger = logging.getLogger(__name__)


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


async def dataset_unavailable_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.warning("Dataset unavailable for %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Dados ainda não disponíveis. Execute o pipeline (job-analyzer run).",
            "request_id": _request_id(request),
        },
    )


async def validation_error_handler(request: Request, exc: Exception) -> JSONResponse:
    errors = exc.errors() if isinstance(exc, RequestValidationError) else []
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Parâmetros inválidos.",
            # Location + message only: the rejected input is not echoed back.
            "errors": [
                {"loc": [str(part) for part in err.get("loc", ())], "msg": str(err.get("msg", ""))}
                for err in errors
            ],
            "request_id": _request_id(request),
        },
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "Unhandled error on %s %s (request_id=%s)",
        request.method,
        request.url.path,
        _request_id(request),
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Erro interno inesperado.", "request_id": _request_id(request)},
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(DatasetUnavailableError, dataset_unavailable_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
