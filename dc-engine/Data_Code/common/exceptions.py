"""Application-specific exceptions used to keep error handling explicit."""

class DataCodeError(Exception):
    """Base exception for Data Code runtime errors."""
class DataCodeValidationError(ValueError, DataCodeError):
    """Raised when user/config input fails validation before execution."""
class DataCodeConfigurationError(DataCodeError):
    """Raised when required runtime configuration is missing or invalid."""
class DataCodeConnectionError(DataCodeError):
    """Raised when creating, testing, or closing a connection fails."""
class DataCodeQueryExecutionError(DataCodeError):
    """Raised when a SQL query or cursor operation fails."""
class DataCodePersistenceError(DataCodeError):
    """Raised when saving templates or persisting result rows fails."""
class DataCodeFileParseError(DataCodeError):
    """Raised when an input file cannot be parsed into rows/schema."""
