"""File persistence for raw snapshots and the processed dataset.

* Writes are atomic (temp file + os.replace), so readers never see a half-written file.
* Every path is resolved and checked to stay inside DATA_DIR (no path traversal).
* Reads enforce a size limit and validate the content against the Pydantic schema.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

from pydantic import BaseModel, ValidationError

from job_analyzer.exceptions import DatasetNotFoundError, DataValidationError
from job_analyzer.models import Dataset, History, RawSnapshot, SourceName

logger = logging.getLogger(__name__)

DATASET_FILENAME = "dataset.json"
HISTORY_FILENAME = "history.json"


class DataStore:
    def __init__(self, data_dir: Path, *, max_file_bytes: int) -> None:
        self.base_dir = data_dir.resolve()
        self.max_file_bytes = max_file_bytes

    @property
    def dataset_path(self) -> Path:
        return self._safe_path("processed", DATASET_FILENAME)

    @property
    def history_path(self) -> Path:
        return self._safe_path("processed", HISTORY_FILENAME)

    # ------------------------------------------------------------------ raw snapshots
    def save_raw_snapshot(self, snapshot: RawSnapshot) -> Path:
        filename = snapshot.collected_at.strftime("%Y%m%dT%H%M%SZ") + ".json"
        path = self._safe_path("raw", snapshot.source.value, filename)
        self._write_model(path, snapshot)
        return path

    def iter_raw_snapshots(self, source: SourceName, *, limit: int) -> Iterator[RawSnapshot]:
        """Yield the newest `limit` valid snapshots of a source; corrupt files are skipped."""
        directory = self._safe_path("raw", source.value)
        if not directory.is_dir():
            return
        files = sorted(directory.glob("*.json"), reverse=True)[:limit]
        for path in files:
            try:
                yield RawSnapshot.model_validate(self._read_json(path))
            except DataValidationError as exc:
                logger.warning("Skipping unreadable snapshot %s: %s", path.name, exc)
            except ValidationError as exc:
                logger.warning(
                    "Skipping snapshot %s: %d schema error(s)", path.name, exc.error_count()
                )

    # ------------------------------------------------------------------ processed dataset
    def save_dataset(self, dataset: Dataset) -> Path:
        path = self.dataset_path
        self._write_model(path, dataset)
        return path

    def load_dataset(self) -> Dataset:
        path = self.dataset_path
        if not path.is_file():
            raise DatasetNotFoundError(f"{path.name} not found; run `job-analyzer run` first")
        try:
            return Dataset.model_validate(self._read_json(path))
        except ValidationError as exc:
            raise DataValidationError(
                f"{path.name} does not match the dataset schema ({exc.error_count()} errors)"
            ) from exc

    def dataset_mtime(self) -> float | None:
        try:
            return self.dataset_path.stat().st_mtime
        except FileNotFoundError:
            return None

    # ------------------------------------------------------------------ daily history
    def load_history(self) -> History:
        """The saved history, or an empty one before the first point is recorded."""
        path = self.history_path
        if not path.is_file():
            return History()
        try:
            return History.model_validate(self._read_json(path))
        except ValidationError as exc:
            raise DataValidationError(
                f"{path.name} does not match the history schema ({exc.error_count()} errors)"
            ) from exc

    def save_history(self, history: History) -> Path:
        path = self.history_path
        self._write_model(path, history)
        return path

    def history_mtime(self) -> float | None:
        try:
            return self.history_path.stat().st_mtime
        except FileNotFoundError:
            return None

    # ------------------------------------------------------------------ internals
    def _safe_path(self, *parts: str) -> Path:
        path = self.base_dir.joinpath(*parts).resolve()
        if not path.is_relative_to(self.base_dir):
            raise DataValidationError(
                f"refusing to access a path outside the data directory: {path}"
            )
        return path

    def _read_json(self, path: Path) -> object:
        size = path.stat().st_size
        if size > self.max_file_bytes:
            raise DataValidationError(f"{path.name} is {size} bytes (limit {self.max_file_bytes})")
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise DataValidationError(f"{path.name} is not valid UTF-8 JSON: {exc}") from exc

    def _write_model(self, path: Path, model: BaseModel) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = model.model_dump_json(indent=None, exclude_none=False)
        fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.stem}-", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            Path(tmp_name).replace(path)
        except BaseException:
            Path(tmp_name).unlink(missing_ok=True)
            raise
        logger.info("Wrote %s (%.1f KB)", path, path.stat().st_size / 1024)
