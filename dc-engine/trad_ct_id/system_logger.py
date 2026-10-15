from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Any, List


@dataclass
class SystemLogEntry:
    job_id: str
    timestamp: datetime
    code: str
    severity: str
    message: str
    context: Dict[str, Any]


class SystemLogger:
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.logs: List[SystemLogEntry] = []

    def log_system(self, code: str, severity: str, message: str, context=None):
        self.logs.append(
            SystemLogEntry(
                job_id=self.job_id,
                timestamp=datetime.now(timezone.utc),
                code=code,
                severity=severity,
                message=message,
                context=context or {}
            )
        )

    def get_logs(self) -> List[SystemLogEntry]:
        return self.logs
