import os
from typing import Literal


class LogConfig:
    """Configuration for database logging system."""

    def __init__(
        self,
        flush_interval_seconds: int = 300,
        flush_on_end: bool = True,
        db_logging_enabled: bool = True,
        flush_mode: Literal["periodic", "on_end_only"] = "periodic",
    ):
        """
        Initialize logging configuration.

        Args:
            flush_interval_seconds: Interval in seconds to flush logs to database (default: 300 / 5 minutes)
            flush_on_end: Whether to flush remaining logs on job completion (default: True)
            db_logging_enabled: Whether database logging is enabled (default: True)
            flush_mode: Flush strategy - 'periodic' for time-based or 'on_end_only' for job completion only
        """
        self.flush_interval_seconds = flush_interval_seconds
        self.flush_on_end = flush_on_end
        self.db_logging_enabled = db_logging_enabled
        self.flush_mode = flush_mode

    @classmethod
    def from_env(cls) -> "LogConfig":
        """Create LogConfig from environment variables."""
        flush_interval = int(os.getenv("LOG_FLUSH_INTERVAL_SECONDS", "300"))
        flush_on_end = os.getenv("LOG_FLUSH_ON_END", "true").lower() == "true"
        db_logging_enabled = os.getenv("DB_LOGGING_ENABLED", "true").lower() == "true"
        flush_mode = os.getenv("LOG_FLUSH_MODE", "periodic")

        if flush_mode not in ("periodic", "on_end_only"):
            flush_mode = "periodic"

        return cls(
            flush_interval_seconds=flush_interval,
            flush_on_end=flush_on_end,
            db_logging_enabled=db_logging_enabled,
            flush_mode=flush_mode,
        )
