"""
Shared string-to-SQL-identifier sanitization helpers. Used wherever a
user-supplied name (a file name, a table prefix, a check id) needs to become
a safe fragment of a SQL table/identifier name.
"""
import os


def sanitize_identifier_fragment(value: str) -> str:
    """
    Lowercase, strip, and reduce to a safe SQL-identifier fragment: spaces
    and hyphens become underscores, and only alphanumerics/underscores survive.
    """
    safe = (value or "").strip().lower().replace("-", "_").replace(" ", "_")
    return "".join(c for c in safe if c.isalnum() or c == "_")


def sanitize_file_name_for_table(file_name: str) -> str:
    """
    Reduce a file name (path and extension allowed) to a safe SQL-identifier
    fragment: strips the directory and extension, then applies
    `sanitize_identifier_fragment` to the remaining stem.
    """
    base_name = os.path.basename(str(file_name))
    stem = os.path.splitext(base_name)[0]
    return sanitize_identifier_fragment(stem)
