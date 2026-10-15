import logging
import threading
import json
from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import uuid4
from Data_Code.common.database import get_db_session, SystemLogRecord


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

            severity = log_entry.get("severity", "INFO")
            code = log_entry.get("code", "")
            message = log_entry.get("message", "")
            print(f"[{severity}] [{code}] {message}")

    def _flush_buffer(self) -> None:
        """Internal method to flush buffer. Must be called with lock held."""
        if not self.buffer:
            return

        try:
            db = get_db_session()
            flush_timestamp = datetime.utcnow()
            # Prepare logs for database insertion
            db_records = []
            for log_entry in self.buffer:
                record = dict(log_entry)
                # Map 'context' to 'context_json' and serialize
                if "context" in record:
                    context = record.pop("context")
                    try:
                        record["context_json"] = json.dumps(context) if context else None
                    except (TypeError, ValueError):
                        record["context_json"] = str(context)
                else:
                    record["context_json"] = None

                # Add flushed_at timestamp
                if "flushed_at" not in record:
                    record["flushed_at"] = flush_timestamp

                db_records.append(record)

            db.bulk_insert_mappings(SystemLogRecord, db_records)
            db.commit()
            self.buffer.clear()
        except Exception as e:
            logging.getLogger(__name__).exception("Error flushing logs to database: %s", e)
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

            message = log_entry.get("message", "")
            print(f"[VALIDATION] {message}")

    def _flush_buffer(self) -> None:
        """Internal method to flush buffer. Must be called with lock held."""
        if not self.buffer:
            return

        try:
            from Data_Code.common.database import get_db_session, ValidationLogRecord

            db = get_db_session()
            flush_timestamp = datetime.utcnow()
            # Prepare logs for database insertion
            db_records = []
            for log_entry in self.buffer:
                record = dict(log_entry)
                # Map 'context' to 'context_json' and serialize if needed
                if "context" in record:
                    context = record.pop("context")
                    try:
                        record["context_json"] = json.dumps(context) if context else None
                    except (TypeError, ValueError):
                        record["context_json"] = str(context)

                # Add flushed_at timestamp
                if "flushed_at" not in record:
                    record["flushed_at"] = flush_timestamp

                db_records.append(record)

            db.bulk_insert_mappings(ValidationLogRecord, db_records)
            db.commit()
            self.buffer.clear()
        except Exception as e:
            logging.getLogger(__name__).exception("Error flushing validation logs to database: %s", e)
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
