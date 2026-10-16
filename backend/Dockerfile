# syntax=docker/dockerfile:1
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_ROOT_USER_ACTION=ignore

WORKDIR /app

# Unprivileged user: the API never needs root.
RUN useradd --create-home --uid 10001 appuser

COPY pyproject.toml ./
COPY src ./src
# Build leftovers are removed in the same layer, so they never ship.
RUN pip install . && rm -rf build src/*.egg-info

COPY --chown=appuser:appuser data/processed ./data/processed
RUN mkdir -p data/raw && chown -R appuser:appuser /app/data

USER appuser

ENV ENVIRONMENT=production \
    DATA_DIR=/app/data \
    API_HOST=0.0.0.0 \
    API_PORT=8000

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import sys, urllib.request; sys.exit(urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).status != 200)"]

CMD ["job-analyzer", "serve"]
