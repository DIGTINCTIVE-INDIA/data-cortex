"""
Shared sequential ID generation, used by connection/check managers that
each need a prefixed, zero-padded, auto-incrementing ID (e.g. DB001, FC001,
CB001).

``next_sequential_id`` is the one to call: it allocates from a PostgreSQL
sequence, which is atomic. ``generate_sequential_id`` (max existing + 1,
computed in Python) is kept for engines without sequences, but it has a race
window -- two concurrent callers read the same max and both hand back the
same ID -- so it is a fallback, not the default.
"""
import re
from typing import Iterable, Optional

from sqlalchemy import text

# Sequence names, one per ID-bearing table. These match the names created by
# the deploy migration, so a migrated database and a freshly initialised one
# behave identically.
DATABASE_CONNECTION_ID_SEQ = "database_connection_id_seq"
FILE_CONNECTION_ID_SEQ = "file_connection_id_seq"
DB_BASED_CHECKS_CONFIG_ID_SEQ = "db_based_checks_config_id_seq"
FILE_BASED_CHECKS_CONFIG_ID_SEQ = "file_based_checks_config_id_seq"
CUSTOM_BUSINESS_CHECKS_CONFIG_ID_SEQ = "custom_business_checks_config_id_seq"

_SEQUENCE_NAME_RE = re.compile(r"^[a-z_][a-z0-9_]*$")


def generate_sequential_id(existing_ids: Iterable[Optional[str]], prefix: str, width: int = 4) -> str:
    """
    Scan `existing_ids` for ones starting with `prefix`, take the max numeric
    suffix, and return `prefix` + (max + 1) zero-padded to `width` digits.

    Example: generate_sequential_id(["DB0001", "DB0002"], "DB") -> "DB0003"

    Width is 4 to match the monorepo's id-generation.repo.ts, which pads every
    prefix to 4 ("DBC0001", "CB0002"). The two allocate into the same ID space,
    so a width of 3 here would have produced "CB001" alongside the application's
    "CB0001" for the same counter value.

    Not concurrency-safe -- prefer ``next_sequential_id``.
    """
    max_num = 0
    for existing_id in existing_ids:
        if not existing_id or not existing_id.startswith(prefix):
            continue
        suffix = existing_id[len(prefix):]
        if suffix.isdigit():
            num = int(suffix)
            if num > max_num:
                max_num = num
    return f"{prefix}{max_num + 1:0{width}d}"


def _highest_existing_number(existing_ids: Iterable[Optional[str]], prefix: str) -> int:
    """Max numeric suffix across `existing_ids` for `prefix`, or 0."""
    highest = 0
    for existing_id in existing_ids:
        if not existing_id or not existing_id.startswith(prefix):
            continue
        suffix = existing_id[len(prefix):]
        if suffix.isdigit():
            highest = max(highest, int(suffix))
    return highest


def next_sequential_id(
    session,
    sequence_name: str,
    prefix: str,
    existing_ids: Optional[Iterable[Optional[str]]] = None,
    width: int = 4,
) -> str:
    """
    Allocate the next `prefix`-ed ID atomically from a PostgreSQL sequence.

    `existing_ids` is used twice, both times as a safety net rather than as
    the primary mechanism: to position a sequence that doesn't exist yet past
    the rows already in the table, and as the input to the max+1 fallback on
    engines that have no sequences. Pass the IDs already in the table.

    Because the numeric suffix always comes from a sequence, generated IDs are
    always ``<prefix><digits>`` and so can never collide with a reserved
    non-numeric identifier such as ``_internal``.
    """
    if not _SEQUENCE_NAME_RE.match(sequence_name or ""):
        raise ValueError(f"Invalid sequence name: {sequence_name!r}")

    bind = session.get_bind()
    if bind is None or bind.dialect.name != "postgresql":
        return generate_sequential_id(existing_ids or [], prefix=prefix, width=width)

    exists = session.execute(
        text("SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = :name"),
        {"name": sequence_name},
    ).scalar()

    if not exists:
        # First use on a database the migration hasn't reached (or a fresh
        # one). Create it and position it past whatever is already stored, so
        # the first allocation doesn't collide with an existing row.
        session.execute(text(f'CREATE SEQUENCE IF NOT EXISTS "{sequence_name}"'))
        session.execute(
            text(f"SELECT setval('{sequence_name}', :value)"),
            {"value": max(_highest_existing_number(existing_ids or [], prefix), 1)},
        )
        if _highest_existing_number(existing_ids or [], prefix) == 0:
            # setval(seq, 1) marks 1 as already used, which would skip it on an
            # empty table. Reset so the first ID really is <prefix>0001.
            session.execute(
                text(f"SELECT setval('{sequence_name}', 1, false)"),
            )

    number = session.execute(text(f"SELECT nextval('{sequence_name}')")).scalar()
    return f"{prefix}{int(number):0{width}d}"
