    
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, List

from pydantic import BaseModel

""""
This class is resposnible for 
    - reading db metadata
    - decrypting password
    - etsablishing connection

"""
from Data_Code.connectors.db.manager import DatabaseConnectionManager
from Data_Code.common.logger import CustomLogger


@dataclass(frozen=True)
class ExecutionContext:
    job_id: str


ctx = ExecutionContext(
    job_id=datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
)


class SystemLogEntry(BaseModel):
    job_id: str
    timestamp: datetime
    code: str
    severity: str
    message: str
    context: Optional[dict] = None


class ValidationLogEntry(BaseModel):
    message: str
    context: Optional[dict] = None

# Kept for backward compatibility (e.g. anything still reading these lists
# directly); no longer the primary path. Logging now routes through the same
# central per-pipeline-run logger (CustomLogger) that the rest of dc_engine.py
# uses, so connection-fetch logs land in the same job-scoped system_logs /
# validation_logs tables as everything else in the run.
system_logs: List[SystemLogEntry] = []
validation_logs: List[ValidationLogEntry] = []


def log_system(code, severity, message, context=None):
    db_handler = CustomLogger.get_db_handler()
    if db_handler:
        db_handler.buffer_log({
            "code": code,
            "severity": severity,
            "message": message,
            "context": context
        })


def log_validation(message, context=None):
    validation_handler = CustomLogger.get_validation_db_handler()
    if validation_handler:
        validation_handler.buffer_log({
            "message": message,
            "context": context
        })


_engine = DatabaseConnectionManager(
    log_system_func=log_system,
    log_validation_func=log_validation
)


def get_connection(connection_id: str):
    """
    Returns database connection details for given connection_id
    """
    return _engine.get_connection(connection_id)

def get_connection_details(connection_id: str):
    return _engine.get_connection_details(connection_id)
