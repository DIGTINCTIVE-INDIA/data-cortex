"""
Best-effort cleanup helpers: wrap teardown calls (closing a cursor/connection/
file, rolling back a transaction, releasing a lock) so a failure during cleanup
never masks the original error or crashes the caller -- while still being
visible via DEBUG logging instead of silently vanishing, which is what a bare
`except Exception: pass` around cleanup code used to do.
"""
import logging

_logger = logging.getLogger(__name__)


def safe_close(resource, method: str = "close", log_fn=None) -> None:
    """
    Best-effort call to `resource.<method>()` (default: `.close()`). Any
    exception is caught and logged at DEBUG (via `log_fn` if given, else the
    module logger) rather than swallowed silently or allowed to propagate.
    """
    if resource is None:
        return
    try:
        getattr(resource, method)()
    except Exception as exc:
        message = f"Best-effort {method}() failed on {resource!r}: {exc}"
        if log_fn:
            try:
                log_fn(message)
            except Exception:
                _logger.debug(message)
        else:
            _logger.debug(message)


def safe_call(func, *args, log_fn=None, **kwargs) -> None:
    """
    Best-effort call to an arbitrary cleanup function (not a `.method()` on
    an object) -- same swallow-but-log semantics as `safe_close`.
    """
    try:
        func(*args, **kwargs)
    except Exception as exc:
        name = getattr(func, "__name__", str(func))
        message = f"Best-effort cleanup call {name}() failed: {exc}"
        if log_fn:
            try:
                log_fn(message)
            except Exception:
                _logger.debug(message)
        else:
            _logger.debug(message)
