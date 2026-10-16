"""Logging setup with secret redaction.

Many job APIs take credentials as query-string parameters (`app_key=`, `token=`...), so any URL
that reaches a log line could leak them. None of the current sources needs a key, but the defences
are in place for the next one:
  * httpx/httpcore request logging (which prints full URLs) is silenced below WARNING;
  * a filter masks well-known secret parameters in every formatted record.
"""

from __future__ import annotations

import logging
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

SENSITIVE_KEYS = frozenset(
    {"app_id", "app_key", "api_key", "apikey", "key", "token", "access_token", "password", "secret"}
)
_SECRET_PATTERN = re.compile(
    r"(?i)\b(" + "|".join(sorted(SENSITIVE_KEYS, key=len, reverse=True)) + r")=([^&\s\"']+)"
)
MASK = "***"


def redact_text(text: str) -> str:
    """Mask `key=value` pairs whose key looks like a credential."""
    return _SECRET_PATTERN.sub(lambda m: f"{m.group(1)}={MASK}", text)


def redact_url(url: str) -> str:
    """Return the URL with sensitive query parameters masked (safe to log or show)."""
    parts = urlsplit(url)
    if not parts.query:
        return url
    query = [
        (key, MASK if key.lower() in SENSITIVE_KEYS else value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
    ]
    return urlunsplit(parts._replace(query=urlencode(query, safe="*")))


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        redacted = redact_text(message)
        if redacted != message:
            record.msg, record.args = redacted, None
        return True


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-8s %(name)s: %(message)s"))
    handler.addFilter(RedactingFilter())

    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)

    for noisy in ("httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
