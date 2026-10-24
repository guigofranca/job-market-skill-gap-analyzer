"""Thread-safe holder of the in-memory analytics, hot-reloaded when dataset.json changes.

If a new file is invalid, the last valid dataset keeps being served (fail-safe), and the error is
reported by /health until a good file is written. history.json (the daily trends) is optional:
when it is missing or invalid, everything else is still served, with empty trends.
"""

from __future__ import annotations

import logging
import threading
import time

from job_analyzer.analytics.service import SkillAnalytics
from job_analyzer.exceptions import (
    DatasetNotFoundError,
    DatasetUnavailableError,
    DataValidationError,
)
from job_analyzer.models import History
from job_analyzer.storage import DataStore

logger = logging.getLogger(__name__)


class DatasetRepository:
    def __init__(self, store: DataStore, *, check_interval_seconds: float = 5.0) -> None:
        self._store = store
        self._check_interval = check_interval_seconds
        self._lock = threading.Lock()
        self._analytics: SkillAnalytics | None = None
        self._loaded_version: tuple[float, float | None] | None = None
        self._last_check: float | None = None
        self.last_error: str | None = None

    def get(self) -> SkillAnalytics:
        now = time.monotonic()
        if self._last_check is None or now - self._last_check >= self._check_interval:
            self.refresh()
        if self._analytics is None:
            raise DatasetUnavailableError(self.last_error or "dataset not loaded")
        return self._analytics

    def peek(self) -> SkillAnalytics | None:
        """Current analytics without raising (used by the health check)."""
        try:
            return self.get()
        except DatasetUnavailableError:
            return None

    def refresh(self) -> None:
        with self._lock:
            self._last_check = time.monotonic()
            mtime = self._store.dataset_mtime()
            if mtime is None:
                self.last_error = "dataset.json not found: run `job-analyzer run` to generate it"
                return
            version = (mtime, self._store.history_mtime())
            if version == self._loaded_version:
                return
            try:
                dataset = self._store.load_dataset()
                self._analytics = SkillAnalytics(dataset, history=self._load_history())
                self.last_error = None
                logger.info("Dataset loaded: %d jobs", len(dataset.jobs))
            except (DataValidationError, DatasetNotFoundError) as exc:
                self.last_error = str(exc)
                logger.error("Could not load dataset: %s", exc)
            finally:
                # Remember the version we tried, so an invalid file is not re-parsed on every call.
                self._loaded_version = version

    def _load_history(self) -> History:
        try:
            return self._store.load_history()
        except DataValidationError as exc:
            logger.error("Could not load history, serving empty trends: %s", exc)
            return History()
