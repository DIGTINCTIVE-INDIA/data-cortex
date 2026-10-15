import json
import logging
import os
import sys
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel

from Data_Code.common.config import LogConfig

# Name used for the single, shared logger instance across the whole project.
LOGGER_NAME = "project_logger"


# -----------------------------------------------------------------------------
# Database-backed logging.Handler subclasses.
#
# These plug into the stdlib `logging` framework: once attached to the shared
# logger, every logger.info()/warning()/etc. call is auto-buffered via emit().
# They can also be filled manually via buffer_log() - that's what
# CustomLogger.get_db_handler()/get_validation_db_handler() are for.
# -----------------------------------------------------------------------------

class DatabaseLogHandler(logging.Handler):
    """Handler that buffers logs and flushes them to the database periodically or on demand."""

    def __init__(self, job_id: str = None, user_id: str = None, batch_size: int = 100):
        """
        Initialize the database log handler.

        Args:
            job_id: Job identifier for log correlation
            user_id: User identifier for log correlation
            batch_size: Number of logs to buffer before auto-flushing
        """
        super().__init__()
        self.job_id = job_id or str(uuid4())
        self.user_id = user_id
        self.batch_size = batch_size
        self.buffer: List[Dict[str, Any]] = []
        self._lock = threading.Lock()

    def emit(self, record: logging.LogRecord) -> None:
        """Buffer a log record."""
        try:
            with self._lock:
                log_entry = {
                    "id": str(uuid4()),
                    "job_id": self.job_id,
                    "user_id": self.user_id,
                    "timestamp": datetime.utcnow(),
                    "code": record.name,
                    "severity": record.levelname,
                    "message": self.format(record),
                    "context": None,
                }
                self.buffer.append(log_entry)

                if len(self.buffer) >= self.batch_size:
                    self._flush_buffer()
        except Exception:
            self.handleError(record)

    def buffer_log(self, log_entry: Dict[str, Any]) -> None:
        """Manually add a log entry to the buffer."""
        with self._lock:
            if "id" not in log_entry:
                log_entry["id"] = str(uuid4())
            if "job_id" not in log_entry:
                log_entry["job_id"] = self.job_id
            if "user_id" not in log_entry and self.user_id:
                log_entry["user_id"] = self.user_id
            if "timestamp" not in log_entry:
                log_entry["timestamp"] = datetime.utcnow()
            if "severity" not in log_entry:
                log_entry["severity"] = "INFO"

            self.buffer.append(log_entry)

            # ERROR/CRITICAL entries are exactly the ones a mid-pipeline crash
            # would otherwise lose if the process dies before the next periodic
            # flush -- write them through immediately instead of waiting.
            if log_entry["severity"] in ("ERROR", "CRITICAL"):
                self._flush_buffer()

    def _flush_buffer(self) -> None:
        """Internal method to flush buffer. Must be called with lock held."""
        if not self.buffer:
            return

        # Imported here, not at module level, to avoid a circular import:
        # logger.py -> database.py -> logger.py
        from Data_Code.common.database import get_db_session, SystemLogRecord

        try:
            db = get_db_session()
            flush_timestamp = datetime.utcnow()
            db_records = []
            for log_entry in self.buffer:
                record = dict(log_entry)
                if "context" in record:
                    context = record.pop("context")
                    try:
                        record["context_json"] = json.dumps(context) if context else None
                    except (TypeError, ValueError):
                        record["context_json"] = str(context)
                else:
                    record["context_json"] = None

                if "flushed_at" not in record:
                    record["flushed_at"] = flush_timestamp

                db_records.append(record)

            db.bulk_insert_mappings(SystemLogRecord, db_records)
            db.commit()
            self.buffer.clear()
        except Exception as e:
            logging.getLogger(LOGGER_NAME).exception("Error flushing logs to database: %s", e)
        finally:
            db.close()

    def flush_to_db(self) -> int:
        """Flush all buffered logs to the database. Returns number of logs flushed."""
        with self._lock:
            count = len(self.buffer)
            self._flush_buffer()
            return count

    def flush_on_exit(self) -> int:
        """Flush remaining logs before shutdown. Returns number of logs flushed."""
        return self.flush_to_db()

    def get_buffer_size(self) -> int:
        """Get current buffer size."""
        with self._lock:
            return len(self.buffer)

    def set_user_id(self, user_id: str) -> None:
        """Update the user_id for this handler."""
        self.user_id = user_id


class ValidationLogHandler(logging.Handler):
    """Handler that buffers validation logs and flushes them to the validation_logs table."""

    def __init__(self, job_id: str = None, user_id: str = None, batch_size: int = 100):
        """
        Initialize the validation log handler.

        Args:
            job_id: Job identifier for log correlation
            user_id: User identifier for log correlation
            batch_size: Number of logs to buffer before auto-flushing
        """
        super().__init__()
        self.job_id = job_id or str(uuid4())
        self.user_id = user_id
        self.batch_size = batch_size
        self.buffer: List[Dict[str, Any]] = []
        self._lock = threading.Lock()

    def emit(self, record: logging.LogRecord) -> None:
        """Buffer a validation log record."""
        try:
            with self._lock:
                log_entry = {
                    "id": str(uuid4()),
                    "job_id": self.job_id,
                    "user_id": self.user_id,
                    "timestamp": datetime.utcnow(),
                    "message": self.format(record),
                    "context_json": None,
                }
                self.buffer.append(log_entry)

                if len(self.buffer) >= self.batch_size:
                    self._flush_buffer()
        except Exception:
            self.handleError(record)

    def buffer_log(self, log_entry: Dict[str, Any]) -> None:
        """Manually add a validation log entry to the buffer."""
        with self._lock:
            if "id" not in log_entry:
                log_entry["id"] = str(uuid4())
            if "job_id" not in log_entry:
                log_entry["job_id"] = self.job_id
            if "user_id" not in log_entry and self.user_id:
                log_entry["user_id"] = self.user_id
            if "timestamp" not in log_entry:
                log_entry["timestamp"] = datetime.utcnow()


            self.buffer.append(log_entry)

    def _flush_buffer(self) -> None:
        """Internal method to flush buffer. Must be called with lock held."""
        if not self.buffer:
            return

        # Imported here, not at module level, to avoid a circular import.
        from Data_Code.common.database import get_db_session, ValidationLogRecord

        try:
            db = get_db_session()
            flush_timestamp = datetime.utcnow()
            db_records = []
            for log_entry in self.buffer:
                record = dict(log_entry)
                if "context" in record:
                    context = record.pop("context")
                    try:
                        record["context_json"] = json.dumps(context) if context else None
                    except (TypeError, ValueError):
                        record["context_json"] = str(context)

                if "flushed_at" not in record:
                    record["flushed_at"] = flush_timestamp

                db_records.append(record)

            db.bulk_insert_mappings(ValidationLogRecord, db_records)
            db.commit()
            self.buffer.clear()
        except Exception as e:
            logging.getLogger(LOGGER_NAME).exception("Error flushing validation logs to database: %s", e)
        finally:
            db.close()

    def flush_to_db(self) -> int:
        """Flush all buffered logs to the database. Returns number of logs flushed."""
        with self._lock:
            count = len(self.buffer)
            self._flush_buffer()
            return count

    def flush_on_exit(self) -> int:
        """Flush remaining logs before shutdown. Returns number of logs flushed."""
        return self.flush_to_db()

    def get_buffer_size(self) -> int:
        """Get current buffer size."""
        with self._lock:
            return len(self.buffer)

    def set_user_id(self, user_id: str) -> None:
        """Update the user_id for this handler."""
        self.user_id = user_id


# -----------------------------------------------------------------------------
# CustomLogger - the single entry point for both text logging and DB-backed
# structured logging.
# -----------------------------------------------------------------------------

class CustomLogger:
    """
    Central logging configuration for the Connection Manager.
    This is the single place any logger (text or DB-backed) is configured.
    """
    _logger = None
    _db_handler: Optional[DatabaseLogHandler] = None
    _validation_db_handler: Optional[ValidationLogHandler] = None
    _flush_thread: Optional[threading.Thread] = None
    _validation_flush_thread: Optional[threading.Thread] = None
    _stop_flush_thread = False
    _lock = threading.Lock()

    @classmethod
    def get_logger(
        cls,
        job_id: str = None,
        user_id: str = None,
        log_config: LogConfig = None,
    ):
        if cls._logger is None:
            cls._logger = logging.getLogger(LOGGER_NAME)
            cls._logger.setLevel(logging.INFO)

            # Prevent double logging if logger is reused
            if not cls._logger.handlers:
                # Create console handler
                console_handler = logging.StreamHandler(sys.stdout)
                console_handler.setLevel(logging.INFO)

                # Create file handler
                log_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs")
                if not os.path.exists(log_dir):
                    os.makedirs(log_dir)

                log_file = os.path.join(log_dir, f"app_{datetime.now().strftime('%Y%m%d')}.log")
                file_handler = logging.FileHandler(log_file)
                file_handler.setLevel(logging.INFO)

                # Create formatter
                formatter = logging.Formatter('%(levelname)s - %(message)s')

                console_handler.setFormatter(formatter)
                file_handler.setFormatter(formatter)

                # Add handlers to logger
                cls._logger.addHandler(console_handler)
                cls._logger.addHandler(file_handler)

        # Add DB handler if not already added and config allows
        if log_config is None:
            log_config = LogConfig()

        if log_config.db_logging_enabled and cls._db_handler is None:
            with cls._lock:
                if cls._db_handler is None:
                    cls._db_handler = DatabaseLogHandler(job_id=job_id, user_id=user_id)
                    cls._logger.addHandler(cls._db_handler)

                    # Initialize validation log handler
                    cls._validation_db_handler = ValidationLogHandler(job_id=job_id, user_id=user_id)

                    # Start periodic flush thread if using periodic mode
                    if log_config.flush_mode == "periodic" and not cls._flush_thread:
                        cls._flush_thread = threading.Thread(
                            target=cls._periodic_flush,
                            args=(log_config.flush_interval_seconds,),
                            daemon=True,
                        )
                        cls._flush_thread.start()

                    # Start validation log flush thread if using periodic mode
                    if log_config.flush_mode == "periodic" and not cls._validation_flush_thread:
                        cls._validation_flush_thread = threading.Thread(
                            target=cls._periodic_flush_validation,
                            args=(log_config.flush_interval_seconds,),
                            daemon=True,
                        )
                        cls._validation_flush_thread.start()

        return cls._logger

    @classmethod
    def _periodic_flush(cls, interval_seconds: int) -> None:
        """Periodically flush logs to database."""
        import time
        while not cls._stop_flush_thread:
            time.sleep(interval_seconds)
            if cls._db_handler and not cls._stop_flush_thread:
                try:
                    cls._db_handler.flush_to_db()
                except Exception as e:
                    cls._logger.exception("Error during periodic flush: %s", e)

    @classmethod
    def _periodic_flush_validation(cls, interval_seconds: int) -> None:
        """Periodically flush validation logs to database."""
        import time
        while not cls._stop_flush_thread:
            time.sleep(interval_seconds)
            if cls._validation_db_handler and not cls._stop_flush_thread:
                try:
                    cls._validation_db_handler.flush_to_db()
                except Exception as e:
                    cls._logger.exception("Error during validation log flush: %s", e)

    @classmethod
    def flush_logs(cls) -> int:
        """Manually flush all buffered logs to database. Returns number of logs flushed."""
        if cls._db_handler:
            return cls._db_handler.flush_to_db()
        return 0

    @classmethod
    def flush_on_exit(cls) -> int:
        """Flush remaining logs before shutdown."""
        cls._stop_flush_thread = True
        count = 0
        if cls._db_handler:
            count += cls._db_handler.flush_on_exit()
        if cls._validation_db_handler:
            count += cls._validation_db_handler.flush_on_exit()
        return count

    @classmethod
    def get_db_handler(cls) -> Optional[DatabaseLogHandler]:
        """Get the database handler if available."""
        return cls._db_handler

    @classmethod
    def get_validation_db_handler(cls) -> Optional[ValidationLogHandler]:
        """Get the validation database handler if available."""
        return cls._validation_db_handler

    @classmethod
    def set_user_id(cls, user_id: str) -> None:
        """Update user_id in both system and validation log handlers."""
        if cls._db_handler:
            cls._db_handler.set_user_id(user_id)
        if cls._validation_db_handler:
            cls._validation_db_handler.set_user_id(user_id)

    @classmethod
    def set_job_id(cls, job_id: str) -> None:
        """Update job_id in both system and validation log handlers."""
        if cls._db_handler:
            cls._db_handler.job_id = job_id
        if cls._validation_db_handler:
            cls._validation_db_handler.job_id = job_id

    @classmethod
    def set_job_context(cls, job_id: str = None, user_id: str = None) -> None:
        """Convenience method to update job_id and/or user_id together at job start."""
        if job_id is not None:
            cls.set_job_id(job_id)
        if user_id is not None:
            cls.set_user_id(user_id)


# Export a default logger instance.
# Import this everywhere text logging is needed: `from Data_Code.common.logger import logger`
logger = CustomLogger.get_logger()


# -----------------------------------------------------------------------------
# Structured job-level logging (system logs + validation logs)
#
# These are accumulated in-memory during a job run (via log_system/log_validation)
# and persisted in bulk at the end of the job via `persist_job_logs()` in
# common/database.py. This is a separate, additional path from the DB handlers
# above - those are driven by the logging framework (emit()), these are called
# directly by connector code with an explicit list + job_id.
# -----------------------------------------------------------------------------

class SystemLogEntry(BaseModel):
    job_id: str
    timestamp: datetime
    code: str
    severity: str  # INFO | WARNING | ERROR | CRITICAL
    message: str
    context: Optional[Dict[str, Any]] = None


class ValidationLogEntry(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = None


def log_system(
    logs: List[SystemLogEntry],
    job_id: str,
    code: str,
    severity: str,
    message: str,
    context: Optional[Dict[str, Any]] = None,
) -> List[SystemLogEntry]:
    """
    Appends a new system log entry to the provided list.
    Returns the updated list.
    """
    if logs is None:
        logs = []

    entry = SystemLogEntry(
        job_id=job_id,
        timestamp=datetime.now(timezone.utc),
        code=code,
        severity=severity,
        message=message,
        context=context,
    )
    logs.append(entry)
    return logs


def log_validation(
    logs: List[ValidationLogEntry],
    message: str,
    context: Optional[Dict[str, Any]] = None,
) -> List[ValidationLogEntry]:
    """
    Appends a new validation log entry to the provided list.
    Returns the updated list.
    """
    if logs is None:
        logs = []

    entry = ValidationLogEntry(message=message, context=context)
    logs.append(entry)
    return logs