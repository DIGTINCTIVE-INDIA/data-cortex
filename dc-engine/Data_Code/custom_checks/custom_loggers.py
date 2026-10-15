from dataclasses import dataclass, field
import uuid
import threading
from typing import Optional

# -----------------------------------------------------------------------------
# Context Management
# -----------------------------------------------------------------------------

@dataclass
class ExecutionContext:
    job_id: str

# Thread-local storage for context
_thread_context = threading.local()

def initialize_context(job_id: Optional[str] = None) -> str:
    """
    Initializes the execution context for the current thread.
    If no job_id is provided, generates a new one.
    Returns the job_id.
    """
    if not job_id:
        job_id = f"JOB_{uuid.uuid4().hex[:8].upper()}"
    
    _thread_context.current = ExecutionContext(job_id=job_id)
    return job_id

def get_current_context() -> ExecutionContext:
    """
    Retrieves the current execution context. 
    If not initialized, initializes a default one.
    """
    if not hasattr(_thread_context, 'current'):
        initialize_context()
    return _thread_context.current

def get_job_id() -> str:
    """Helper to get current job_id."""
    return get_current_context().job_id
