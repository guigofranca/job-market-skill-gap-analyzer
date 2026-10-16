from __future__ import annotations

import logging

import pytest
from pydantic import ValidationError

from job_analyzer.config import BACKEND_DIR, Environment, Settings
from job_analyzer.logging_config import RedactingFilter, redact_text, redact_url
from job_analyzer.models import SourceName


def make(**kwargs: object) -> Settings:
    return Settings(_env_file=None, **kwargs)  # type: ignore[arg-type,call-arg]


def test_csv_values_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENABLED_SOURCES", "gupy, solides")
    monkeypatch.setenv("API_CORS_ORIGINS", "http://localhost:5173,https://app.example.com")
    settings = make()
    assert settings.enabled_sources == [SourceName.GUPY, SourceName.SOLIDES]
    assert settings.api_cors_origins == ["http://localhost:5173", "https://app.example.com"]


@pytest.mark.parametrize(
    "kwargs",
    [
        {"api_cors_origins": ["localhost:5173"]},
        {"api_cors_origins": ["http://localhost:5173/path"]},
        {"enabled_sources": ["linkedin"]},
        {"gupy_search_terms": []},
        {"http_timeout_seconds": 0},
        {"environment": "production", "api_cors_origins": ["*"]},
    ],
)
def test_invalid_settings_are_rejected(kwargs: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        make(**kwargs)


def test_relative_data_dir_is_anchored_to_backend() -> None:
    assert make(data_dir="data").data_dir == (BACKEND_DIR / "data").resolve()


def test_docs_never_enabled_in_production() -> None:
    assert not make(environment=Environment.PRODUCTION, api_enable_docs=True).docs_enabled


def test_redaction_helpers() -> None:
    url = "https://api.example.com/v1/jobs/search/1?app_id=abc&app_key=xyz&what=dados"
    assert (
        redact_url(url)
        == "https://api.example.com/v1/jobs/search/1?app_id=***&app_key=***&what=dados"
    )
    assert redact_text("GET ...?token=abc123&page=2") == "GET ...?token=***&page=2"


def test_redacting_filter_masks_log_records() -> None:
    record = logging.LogRecord(
        "x", logging.INFO, __file__, 1, "calling %s", ("?app_key=s3cr3t",), None
    )
    RedactingFilter().filter(record)
    assert record.getMessage() == "calling ?app_key=***"
