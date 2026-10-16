"""Domain exceptions. Every error raised on purpose by the package derives from JobAnalyzerError."""


class JobAnalyzerError(Exception):
    """Base class for expected, handled failures."""


class ConfigurationError(JobAnalyzerError):
    """Settings are missing or inconsistent."""


class SourceError(JobAnalyzerError):
    """A job source could not be reached or returned an unusable payload."""


class DataValidationError(JobAnalyzerError):
    """A data file exists but does not match the expected schema."""


class DatasetNotFoundError(JobAnalyzerError):
    """The processed dataset has not been generated yet."""


class DatasetUnavailableError(JobAnalyzerError):
    """The API has no valid dataset loaded (missing or invalid file)."""
