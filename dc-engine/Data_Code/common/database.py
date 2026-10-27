from datetime import datetime
import json
import os
import re
import uuid
from typing import Any, Dict, List, Optional



from sqlalchemy.schema import Sequence
from sqlalchemy import Column, DateTime, String, Text, create_engine, text, inspect, Boolean, Integer, BigInteger, func, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, ENUM as PG_ENUM, ARRAY as PG_ARRAY
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

from Data_Code.common.logger import logger

# Load environment variables from the project root .env
# common/database.py -> Data_Code/ -> project root is parent of Data_Code
current_dir = os.path.dirname(os.path.abspath(__file__))
data_code_dir = os.path.dirname(current_dir)
project_root = os.path.dirname(data_code_dir)
for env_path in (
    os.path.join(project_root, ".env"),
    os.path.join(data_code_dir, ".env"),
):
    if os.path.isfile(env_path):
        load_dotenv(env_path, override=False)

# Define Base
Base = declarative_base()


class SystemLogRecord(Base):
    __tablename__ = "system_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(String, index=True, nullable=False)
    user_id = Column(String, nullable=True, index=True)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    code = Column(String, index=True, nullable=False)
    severity = Column(String, index=True, nullable=False)
    message = Column(Text, nullable=False)
    context_json = Column(Text, nullable=True)
    flushed_at = Column(DateTime, nullable=True, index=True)


class ValidationLogRecord(Base):
    __tablename__ = "validation_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    job_id = Column(String, index=True, nullable=False)
    user_id = Column(String, nullable=True, index=True)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    message = Column(Text, nullable=False)
    context_json = Column(Text, nullable=True)
    flushed_at = Column(DateTime, nullable=True, index=True)


# ---------------------------------------------------------------------------
# Postgres enum types.
#
# create_type=False on purpose: the monorepo (Drizzle) owns the schema and
# creates these types. This engine only reads and writes rows, so it must not
# try to CREATE TYPE and must not disagree about the labels.
# ---------------------------------------------------------------------------
USER_ROLE_ENUM = PG_ENUM("admin", "engineer", "analyst", "service", name="user_role", create_type=False)
QC_TAG_TYPE_ENUM = PG_ENUM(
    "impacted_downstream", "workstream", "data_source", "category",
    name="qc_tag_type", create_type=False,
)
CHECK_CRITICALITY_ENUM = PG_ENUM("low", "medium", "high", name="check_criticality", create_type=False)
RESULTS_CRITICALITY_ENUM = PG_ENUM("low", "medium", "high", name="results_criticality", create_type=False)
CHECK_STATUS_ENUM = PG_ENUM("passed", "failed", "error", "upstream_failed", name="check_status", create_type=False)
CHECK_TYPE_ENUM = PG_ENUM("traditional", "custom_sql", name="check_type", create_type=False)
ISSUE_STATUS_ENUM = PG_ENUM("open", "resolved", "discarded", name="issue_status", create_type=False)
SOURCE_FILE_TYPE_ENUM = PG_ENUM("excel", "csv", "json", name="source_file_type", create_type=False)
SOURCE_FILE_DELIMITER_ENUM = PG_ENUM(
    "comma", "pipe", "tab", "semicolon", name="source_file_delimiter", create_type=False,
)
TCD_DATA_TYPE_ENUM = PG_ENUM(
    "string", "integer", "float", "date", "datetime", "boolean", "varchar",
    name="tcd_data_type", create_type=False,
)


class User(Base):
    """
    Users table. This backend does NOT authenticate -- the monorepo does. The
    table exists here only so jobs can reference a user_id.
    """
    __tablename__ = "users"

    id = Column(PG_UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()"))
    email = Column(String(255), nullable=False, unique=True)
    full_name = Column(String(255), nullable=False)
    role = Column(USER_ROLE_ENUM, nullable=False, server_default="analyst")
    refresh_token = Column(Text, nullable=True)
    enabled = Column(Boolean, nullable=False, server_default=text("true"))
    created_by = Column(PG_UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # No server_default: a never-logged-in user must read as NULL, not "now".
    last_login_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, server_default=func.now())
    deleted_at = Column("deactivated_at", DateTime, nullable=True)


class QcTag(Base):
    """
    The single label table, replacing the four *_library tables this engine used
    to declare (workstream_library / category_label_library / data_source_library
    / impacted_downstream_library). None of those exist in the database any more;
    every label dimension is a qc_tags row discriminated by `type`.
    """
    __tablename__ = "qc_tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    type = Column(QC_TAG_TYPE_ENUM, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    user_id = Column(PG_UUID(as_uuid=False), nullable=False)
    enabled = Column(Boolean, nullable=False, server_default=text("true"))
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, server_default=func.now())
    deactivated_at = Column(DateTime, nullable=True)


class FileBasedCheckConfig(Base):
    """ORM for file-based validation checks configuration."""
    __tablename__ = "file_based_checks_config"

    config_id = Column(String, primary_key=True)
    config_name = Column(String, nullable=False)
    check_category = Column(Integer, ForeignKey("qc_tags.id"), nullable=False)
    workstream = Column(Integer, ForeignKey("qc_tags.id"), nullable=False)
    # A list of qc_tags ids, not one id. Postgres cannot foreign-key an array
    # element, so this link is not enforced by the database.
    impacted_downstream = Column(PG_ARRAY(Integer), nullable=False)
    data_source = Column(Integer, ForeignKey("qc_tags.id"), nullable=False)
    source_connection_id = Column(String, nullable=False)
    source_file_type = Column(SOURCE_FILE_TYPE_ENUM, nullable=False, server_default="csv")
    source_file_delimiter = Column(SOURCE_FILE_DELIMITER_ENUM, nullable=True)
    source_file_name = Column(String, nullable=False)
    source_file_path = Column(String, nullable=True, server_default="/")
    target_connection_id = Column(String, nullable=False)
    target_table_prefix = Column(String, nullable=False)
    landing_table = Column(Boolean, nullable=False, server_default=text("FALSE"))
    landing_table_name = Column(String, nullable=True)
    enabled = Column(Boolean, nullable=False, server_default=text("TRUE"))
    user_id = Column(PG_UUID(as_uuid=False), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, server_default=func.now())
    deactivated_at = Column(DateTime, nullable=True)


class DbBasedCheckConfig(Base):
    """ORM for database-based validation checks configuration."""
    __tablename__ = "db_based_checks_config"

    config_id = Column(String, primary_key=True)
    config_name = Column(String, nullable=False)
    check_category = Column(Integer, ForeignKey("qc_tags.id"), nullable=False)
    workstream = Column(Integer, ForeignKey("qc_tags.id"), nullable=False)
    impacted_downstream = Column(PG_ARRAY(Integer), nullable=False)
    data_source = Column(Integer, ForeignKey("qc_tags.id"), nullable=False)
    source_connection_id = Column(String, nullable=False)
    source_table_name = Column(String, nullable=False)
    target_connection_id = Column(String, nullable=False)
    target_table_prefix = Column(String, nullable=False)
    landing_table = Column(Boolean, nullable=False, server_default=text("FALSE"))
    landing_table_name = Column(String, nullable=True)
    enabled = Column(Boolean, nullable=False, server_default=text("TRUE"))
    user_id = Column(PG_UUID(as_uuid=False), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, server_default=func.now())
    deactivated_at = Column(DateTime, nullable=True)


# custom_business_checks_config is mapped by CustomCheckConfig in
# Data_Code/custom_checks/models.py. It is NOT declared here: both share one
# declarative Base, and two classes for one table raise
# "Table is already defined for this MetaData instance" at import time.

class Results(Base):
    """ORM for the public.results table."""

    __tablename__ = "results"
    __table_args__ = {"schema": "public"}

    check_execution_id = Column(
        Integer, Sequence("results_check_execution_id_seq"), primary_key=True, autoincrement=True
    )
    job_id = Column(String, nullable=False)
    job_timestamp = Column(DateTime, nullable=False)
    user_id = Column(PG_UUID(as_uuid=False), nullable=False)
    check_id = Column(String, nullable=False)
    check_name = Column(String, nullable=False)
    check_description = Column(String, nullable=True)
    config_id = Column(String, nullable=False)
    config_name = Column(String, nullable=False)
    check_category = Column(Integer, nullable=False)
    workstream = Column(Integer, nullable=False)
    impacted_downstream = Column(PG_ARRAY(Integer), nullable=False)
    data_source = Column(Integer, nullable=False)
    file_or_table_name = Column(String, nullable=False)
    check_type = Column(CHECK_TYPE_ENUM, nullable=False)
    # NULL means "this check is not about one column" (table-level checks).
    field = Column(String, nullable=True)
    abort = Column(Boolean, nullable=False)
    check_status = Column(CHECK_STATUS_ENUM, nullable=False)
    criticality = Column(RESULTS_CRITICALITY_ENUM, nullable=True)
    issue_rows = Column(String, nullable=False)
    passed_rows = Column(String, nullable=False)
    # Run-level row picture, the same on every result row of a config in one run: how many rows
    # the table (or the custom check's source) had, and how many different rows failed at least
    # one check. NULL when the rows were never evaluated (a gate check stopped the config, or the
    # check errored) and on results written before these columns existed.
    rows_total = Column(Integer, nullable=True)
    rows_failed = Column(Integer, nullable=True)
    failure_reason = Column(String, nullable=True)
    issue_status = Column(ISSUE_STATUS_ENUM, nullable=True, server_default="open")
    # Set by a person in QC Alerts, never by the engine. Distinct from
    # failure_reason, which is the engine's own explanation of the failure.
    issue_status_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, server_default=func.now())


class TraditionalChecksLibraryRev(Base):
    """
    ORM for traditional_checks_library_rev -- the fixed master list of traditional
    check types (TC001-TC011). Reference data: seeded once at init_db() time, not
    meant to be edited per deployment. Schema/seed data matched to the real RDS
    dev database (data_cortex) as of this writing.
    """

    __tablename__ = "traditional_checks_library_rev"

    check_id = Column(
        String(10),
        primary_key=True,
        server_default=text(
            "'TC' || lpad(nextval('traditional_checks_library_rev_seq')::text, 3, '0')"
        ),
    )
    check_mapping_name = Column(String(255), nullable=False, unique=True)
    check_name = Column(String(255), nullable=False, unique=True)
    check_description = Column(Text, nullable=True)
    abort = Column(Boolean, nullable=False)


class TraditionalConfigDetails(Base):
    """
    ORM for traditional_config_details -- per-field check configuration for
    traditional (DB-based) check jobs. Created empty; populated per real
    deployment/config, not seeded here.
    """

    __tablename__ = "traditional_config_details"

    tc_req_id = Column(Integer, primary_key=True, autoincrement=True)
    config_id = Column(String, nullable=False)
    field = Column(String, nullable=False)

    # NOT NULL in the database with no default -- an insert that omits either
    # of these fails outright.
    column_order = Column(Integer, nullable=False)
    column_datatype = Column(TCD_DATA_TYPE_ENUM, nullable=False)

    primary_key_check = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    primary_key_check_criticality = Column(CHECK_CRITICALITY_ENUM, nullable=True)

    null_check = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    null_check_criticality = Column(CHECK_CRITICALITY_ENUM, nullable=True)

    length_check = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    min_length = Column(Integer, nullable=True)
    max_length = Column(Integer, nullable=True)
    length_check_criticality = Column(CHECK_CRITICALITY_ENUM, nullable=True)

    format_check = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    format_regex = Column(String(500), nullable=True)
    format_check_criticality = Column(CHECK_CRITICALITY_ENUM, nullable=True)

    lov_check = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    lovs = Column(Text, nullable=True)
    lov_check_criticality = Column(CHECK_CRITICALITY_ENUM, nullable=True)

    duplicate_check = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    duplicate_check_criticality = Column(CHECK_CRITICALITY_ENUM, nullable=True)

    ri_check = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    ri_reference_table = Column(String(200), nullable=True)
    ri_field_name = Column(String(200), nullable=True)
    ri_check_criticality = Column(CHECK_CRITICALITY_ENUM, nullable=True)
    ri_connection_id = Column(String, nullable=True)

    enabled = Column(Boolean, nullable=False, server_default=text("TRUE"))
    user_id = Column(PG_UUID(as_uuid=False), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, server_default=func.now())
    deactivated_at = Column(DateTime, nullable=True)

    column_datatype = Column(String(255), nullable=False)
    column_order = Column(Integer, nullable=False)














# Global engine and Session
_engine = None
_Session = None


def _env_int(name: str, default: int) -> int:
    """
    Read an integer env var, falling back to `default` only when it is unset.

    A value that is set but unparseable is an error, not a fallback: silently
    substituting the default for a typo'd RDS_PORT connects to a different
    port than the operator configured and the mistake never surfaces.
    """
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return int(str(raw).strip())
    except ValueError as e:
        raise ValueError(
            f"{name}={raw!r} is not a valid integer. Fix it in .env -- it is not "
            f"defaulted to {default}, because that would silently use a different "
            f"value than the one configured."
        ) from e


def _safe_pg_identifier(name: str) -> str:
    """Allow only unquoted-safe PostgreSQL identifiers for schema names."""
    s = (name or "").strip()
    if not s or not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", s):
        raise ValueError(f"Invalid PostgreSQL schema name: {name!r}")
    return s


def get_engine():
    global _engine
    if _engine:
        return _engine

    rds_host = os.getenv("RDS_HOST")
    rds_username = os.getenv("RDS_USERNAME")
    rds_password = os.getenv("RDS_PASSWORD")
    rds_database = os.getenv("RDS_DATABASE")
    rds_engine = os.getenv("RDS_ENGINE", "postgresql").lower()
    rds_schema = os.getenv("RDS_SCHEMA", "public")

    if not all([rds_host, rds_username, rds_password, rds_database]):
        meta_db_url = os.getenv("META_DB_URL")
        if meta_db_url:
            _engine = create_engine(meta_db_url, echo=False, pool_pre_ping=True, pool_recycle=300)
            return _engine

        raise ValueError("Database credentials (RDS_*) are missing in .env")

    connect_args = {}
    if rds_engine == "postgresql":
        port = str(_env_int("RDS_PORT", 5432))
        connection_string = (
            f"postgresql://{rds_username}:{rds_password}@{rds_host}:{port}/{rds_database}"
        )
        # sslmode matters: libpq defaults to "prefer", which silently falls back
        # to plaintext, and this RDS rejects unencrypted connections -- the client
        # then sees "SSL SYSCALL error: EOF detected" instead of the real reason.
        connect_args = {
            "options": f"-c search_path={_safe_pg_identifier(rds_schema)}",
            "sslmode": os.getenv("RDS_SSLMODE", "require"),
            # Detect a dead peer in ~a minute instead of never. A worker idle overnight
            # holds pooled sockets that a firewall or NAT has silently dropped.
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 3,
        }
    elif rds_engine == "mysql":
        port = str(_env_int("RDS_PORT", 3306))
        connection_string = (
            f"mysql+pymysql://{rds_username}:{rds_password}@{rds_host}:{port}/{rds_database}"
        )
    else:
        raise ValueError(f"Unsupported RDS_ENGINE: {rds_engine}")

    # pool_pre_ping tests a pooled connection before handing it out and transparently
    # replaces a dead one. Without it the first run after an idle period failed with
    # "SSL SYSCALL error: EOF detected": the pool offered a socket the network had
    # already closed. pool_recycle retires connections before idle timeouts reach them.
    _engine = create_engine(
        connection_string,
        echo=False,
        connect_args=connect_args,
        pool_pre_ping=True,
        pool_recycle=300,
    )
    return _engine


def _log_migration_warning(msg: str, exc: Exception) -> None:
    logger.warning("%s: %s", msg, exc)


def _import_orm_models() -> None:
    """
    Import ORM modules so their Table objects register on Base.metadata before create_all().
    """
    try:
        import Data_Code.connectors.db.models  # noqa: F401
        import Data_Code.connectors.file.models  # noqa: F401
        import Data_Code.custom_checks.models  # noqa: F401
    except ImportError as e:
        raise ImportError(
            "Could not import Data_Code ORM models. Ensure the project root is on sys.path "
            "(so the `Data_Code` package resolves), then call init_db()."
        ) from e


def _ensure_postgresql_schema(engine) -> None:
    """Create application schema if missing (PostgreSQL only)."""
    if engine.dialect.name != "postgresql":
        return
    schema = os.getenv("RDS_SCHEMA", "public")
    ident = _safe_pg_identifier(schema)
    with engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{ident}"'))


def _ensure_traditional_checks_library_seq(engine) -> None:
    """
    Create the sequence backing traditional_checks_library_rev.check_id's default
    (TC001, TC002, ...) before create_all() runs, since the column's server_default
    references it.
    """
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        conn.execute(text("CREATE SEQUENCE IF NOT EXISTS traditional_checks_library_rev_seq"))


# Fixed reference data: the 11 traditional check types. Matched to the real RDS
# dev database (data_cortex) as of this writing -- seeded once, not user-editable.
TRADITIONAL_CHECKS_LIBRARY_SEED = [
    {"check_id": "TC001", "check_mapping_name": "file_availability_check", "check_name": "File Availability",
     "check_description": "Ensures required file exists before processing", "abort": True},
    {"check_id": "TC002", "check_mapping_name": "column_name_check", "check_name": "Column Name",
     "check_description": "Ensures all columns are named correctly according to the schema", "abort": True},
    {"check_id": "TC003", "check_mapping_name": "column_order_check", "check_name": "Column Order",
     "check_description": "Ensures all columns are ordered correctly based on the schema", "abort": True},
    {"check_id": "TC004", "check_mapping_name": "datatype_check", "check_name": "Data Type",
     "check_description": "Validates correct data type for fields", "abort": True},
    {"check_id": "TC005", "check_mapping_name": "primary_key_check", "check_name": "Primary Key",
     "check_description": "Ensures primary key exists and populated correctly", "abort": False},
    {"check_id": "TC006", "check_mapping_name": "ri_check", "check_name": "Referential Integrity",
     "check_description": "Validates the referential integrity from another file's column", "abort": False},
    {"check_id": "TC007", "check_mapping_name": "null_check", "check_name": "Null",
     "check_description": "Detects missing or empty field values", "abort": False},
    {"check_id": "TC008", "check_mapping_name": "duplicate_check", "check_name": "Duplicate",
     "check_description": "Identifies repeated or redundant data entries", "abort": False},
    {"check_id": "TC009", "check_mapping_name": "lov_check", "check_name": "List of Values",
     "check_description": "Verifies data matches the expected List of Values", "abort": False},
    {"check_id": "TC010", "check_mapping_name": "format_check", "check_name": "Format",
     "check_description": "Verifies data matches expected format pattern", "abort": False},
    {"check_id": "TC011", "check_mapping_name": "length_check", "check_name": "Length",
     "check_description": "Confirms field length within defined limits", "abort": False},
]


def _seed_traditional_checks_library(engine) -> None:
    """Seed traditional_checks_library_rev with the 11 fixed check types, if empty."""
    with engine.begin() as conn:
        count = conn.execute(text("SELECT count(*) FROM traditional_checks_library_rev")).scalar()
        if count:
            return
        for row in TRADITIONAL_CHECKS_LIBRARY_SEED:
            conn.execute(
                text(
                    """
                    INSERT INTO traditional_checks_library_rev
                        (check_id, check_mapping_name, check_name, check_description, abort)
                    VALUES
                        (:check_id, :check_mapping_name, :check_name, :check_description, :abort)
                    """
                ),
                row,
            )
        # Advance the sequence past the seeded fixed IDs so future auto-generated
        # check_ids (a new check type added later) don't collide with TC001-TC011.
        conn.execute(text("SELECT setval('traditional_checks_library_rev_seq', 11)"))


# Normalized label lookups (workstream/check_category/data_source/impacted_downstream),
# copied verbatim from the real RDS dev database (data_cortex) as of this writing.
WORKSTREAM_LIBRARY_SEED = [
    {"workstream_id": 1, "workstream_name": "Sales",
     "workstream_description": "Sales workflow including files, checks and processing logic"},
    {"workstream_id": 2, "workstream_name": "CRM",
     "workstream_description": "CRM workflow handling customer master and interaction data"},
]

CATEGORY_LABEL_LIBRARY_SEED = [
    {"category_id": 1, "category_name": "IQVIA Cross Reference",
     "category_description": "Category representing IQVIA cross-reference checks and mappings"},
    {"category_id": 2, "category_name": "Range/LOV",
     "category_description": "Category for range checks and list-of-values validations"},
    {"category_id": 3, "category_name": "Account",
     "category_description": "Category related to customer or account-level validations"},
    {"category_id": 4, "category_name": "Affiliation",
     "category_description": "Category related to affiliation and relationship validations"},
    {"category_id": 5, "category_name": "Calls",
     "category_description": "Category related to call activity and call-level validations"},
]

DATA_SOURCE_LIBRARY_SEED = [
    {"data_source_id": 1, "data_source_name": "ACCOUNT",
     "data_source_description": "Customer or account-level data source used for validations"},
    {"data_source_id": 2, "data_source_name": "AFFILIATION_VOD_C",
     "data_source_description": "Affiliation dataset sourced from Veeva VOD_C"},
    {"data_source_id": 3, "data_source_name": "Veeva/IQVIA",
     "data_source_description": "Data provided jointly or interchangeably by Veeva and IQVIA systems"},
    {"data_source_id": 4, "data_source_name": "IQVIA LAAD",
     "data_source_description": "IQVIA LAAD dataset used for healthcare provider and sales activities"},
    {"data_source_id": 5, "data_source_name": "All Vendors",
     "data_source_description": "Combined data collected from all external vendor sources"},
]

IMPACTED_DOWNSTREAM_LIBRARY_SEED = [
    {"impacted_downstream_id": 1, "impacted_downstream_name": "Sales",
     "impacted_downstream_description": "Sales Reporting"},
    {"impacted_downstream_id": 2, "impacted_downstream_name": "CRM",
     "impacted_downstream_description": "Impacts CRM data quality, analytics, and reporting processes."},
    {"impacted_downstream_id": 3, "impacted_downstream_name": "CRM_CUSTOMER",
     "impacted_downstream_description": "Impacts CRM customer master data used in analytics and reporting."},
    {"impacted_downstream_id": 4, "impacted_downstream_name": "CRM_ADDRESS",
     "impacted_downstream_description": "Impacts CRM customer address data used for reporting and location-based analysis."},
]


def _seed_label_libraries(engine) -> None:
    """Seed the 4 label-lookup tables with the real dev-DB reference data, if empty."""
    seeds = [
        ("workstream_library", "workstream_id", "workstream_name", "workstream_description", WORKSTREAM_LIBRARY_SEED),
        ("category_label_library", "category_id", "category_name", "category_description", CATEGORY_LABEL_LIBRARY_SEED),
        ("data_source_library", "data_source_id", "data_source_name", "data_source_description", DATA_SOURCE_LIBRARY_SEED),
        ("impacted_downstream_library", "impacted_downstream_id", "impacted_downstream_name",
         "impacted_downstream_description", IMPACTED_DOWNSTREAM_LIBRARY_SEED),
    ]
    with engine.begin() as conn:
        for table, id_col, name_col, desc_col, rows in seeds:
            count = conn.execute(text(f"SELECT count(*) FROM {table}")).scalar()
            if count:
                continue
            for row in rows:
                conn.execute(
                    text(
                        f"INSERT INTO {table} ({id_col}, {name_col}, {desc_col}) "
                        f"VALUES (:{id_col}, :{name_col}, :{desc_col})"
                    ),
                    row,
                )
            # Advance the identity sequence past the explicitly-seeded fixed ids
            # so later get-or-create inserts (resolve_label_id) don't collide
            # with them (same class of issue as traditional_checks_library_rev_seq).
            seq_name = conn.execute(text(f"SELECT pg_get_serial_sequence('{table}', '{id_col}')")).scalar()
            if seq_name:
                max_id = max(r[id_col] for r in rows)
                conn.execute(text(f"SELECT setval('{seq_name}', {max_id})"))


# The four *_library tables this engine used to read no longer exist. Every
# label dimension is now a row in qc_tags, discriminated by `type`.
_QC_TAG_TYPE_BY_LEGACY_TABLE = {
    "workstream_library": "workstream",
    "category_label_library": "category",
    "data_source_library": "data_source",
    "impacted_downstream_library": "impacted_downstream",
}


def resolve_label_id(session, lookup_table: str, id_col: str, name_col: str, label) -> Optional[int]:
    """
    Resolve a human-readable label to its qc_tags id.

    The signature is unchanged so the ~29 existing call sites keep working, but
    `id_col` and `name_col` are now ignored: qc_tags always keys on id/title, and
    `lookup_table` is only used to pick the tag `type`.

    If `label` is already an int (or a numeric string) it is returned as-is --
    which is the normal path, because configs are created in the app and already
    carry real qc_tags ids.

    Unlike the old version this does NOT create a missing label. Tags are managed
    in the app under Configure Libraries, and silently inventing one here produced
    duplicates that no config ever pointed at.
    """
    if label is None:
        return None
    if isinstance(label, int):
        return label
    if isinstance(label, str) and label.strip().isdigit():
        return int(label.strip())

    tag_type = _QC_TAG_TYPE_BY_LEGACY_TABLE.get(lookup_table)
    if tag_type is None:
        raise ValueError(f"Unknown label lookup table: {lookup_table!r}")

    existing = session.execute(
        text("SELECT id FROM qc_tags WHERE type = CAST(:tag_type AS qc_tag_type) AND title = :label"),
        {"tag_type": tag_type, "label": label},
    ).scalar()

    if existing is not None:
        return existing

    raise ValueError(
        f"No qc_tags row of type {tag_type!r} titled {label!r}. "
        "Labels are managed in the app under Configure Libraries."
    )


def _migrate_system_logs_table(engine):
    """Add missing columns to system_logs table if they don't exist."""
    tbl = "system_logs"
    try:
        cols = _table_columns(engine, tbl)
        if not cols:
            return

        with engine.begin() as conn:
            if "user_id" not in cols:
                if engine.dialect.name == "postgresql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN user_id VARCHAR(255)"))
                elif engine.dialect.name == "mysql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN user_id VARCHAR(255)"))

            if "flushed_at" not in cols:
                if engine.dialect.name == "postgresql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN flushed_at TIMESTAMP"))
                elif engine.dialect.name == "mysql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN flushed_at TIMESTAMP"))
    except Exception as e:
        _log_migration_warning("system_logs migration warning", e)


def _migrate_validation_logs_table(engine):
    """Add missing columns to validation_logs table if they don't exist."""
    tbl = "validation_logs"
    try:
        cols = _table_columns(engine, tbl)
        if not cols:
            return

        with engine.begin() as conn:
            if "user_id" not in cols:
                if engine.dialect.name == "postgresql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN user_id VARCHAR(255)"))
                elif engine.dialect.name == "mysql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN user_id VARCHAR(255)"))

            if "flushed_at" not in cols:
                if engine.dialect.name == "postgresql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN flushed_at TIMESTAMP"))
                elif engine.dialect.name == "mysql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN flushed_at TIMESTAMP"))
    except Exception as e:
        _log_migration_warning("validation_logs migration warning", e)


def _migrate_text_column_to_lookup_fk(engine, config_table: str, column: str, lookup_table: str, id_col: str, name_col: str) -> None:
    """
    One-time, idempotent migration: convert `config_table.column` from free
    text to an integer FK into `lookup_table`, creating a lookup row for any
    existing text value that isn't already there. No-ops if the column is
    already an integer (already migrated) or the table doesn't exist yet.
    """
    try:
        with engine.begin() as conn:
            row = conn.execute(
                text(
                    "SELECT data_type FROM information_schema.columns "
                    "WHERE table_name = :t AND column_name = :c"
                ),
                {"t": config_table, "c": column},
            ).fetchone()
            if row is None or row[0] in ("integer", "bigint"):
                return  # table/column missing, or already migrated

            # 1. Ensure a lookup row exists for every distinct existing text value
            conn.execute(text(
                f"INSERT INTO {lookup_table} ({name_col}) "
                f"SELECT DISTINCT {column} FROM {config_table} "
                f"WHERE {column} IS NOT NULL "
                f"AND {column} NOT IN (SELECT {name_col} FROM {lookup_table})"
            ))

            # 2. Add the new integer column, populate it via the lookup, swap it in
            conn.execute(text(f"ALTER TABLE {config_table} ADD COLUMN {column}_id INTEGER"))
            conn.execute(text(
                f"UPDATE {config_table} c SET {column}_id = l.{id_col} "
                f"FROM {lookup_table} l WHERE c.{column} = l.{name_col}"
            ))
            conn.execute(text(f"ALTER TABLE {config_table} DROP COLUMN {column}"))
            conn.execute(text(f"ALTER TABLE {config_table} RENAME COLUMN {column}_id TO {column}"))
            conn.execute(text(f"ALTER TABLE {config_table} ALTER COLUMN {column} SET NOT NULL"))
            conn.execute(text(
                f"ALTER TABLE {config_table} ADD CONSTRAINT fk_{config_table}_{column} "
                f"FOREIGN KEY ({column}) REFERENCES {lookup_table}({id_col})"
            ))
    except Exception as e:
        _log_migration_warning(f"{config_table}.{column} -> {lookup_table} FK migration warning", e)


def _migrate_config_label_columns(engine) -> None:
    """Migrate workstream/check_category/data_source on all 3 config tables to lookup FKs."""
    label_columns = [
        ("workstream", "workstream_library", "workstream_id", "workstream_name"),
        ("check_category", "category_label_library", "category_id", "category_name"),
        ("data_source", "data_source_library", "data_source_id", "data_source_name"),
    ]
    for config_table in ("db_based_checks_config", "file_based_checks_config", "custom_business_checks_config"):
        for column, lookup_table, id_col, name_col in label_columns:
            _migrate_text_column_to_lookup_fk(engine, config_table, column, lookup_table, id_col, name_col)


def _add_audit_columns_to_table(engine, tbl: str) -> None:
    """Add audit columns (user_id, created_at, updated_at, deactivated_at, enabled) to a table if missing."""
    try:
        cols = _table_columns(engine, tbl)
        if not cols:
            return

        with engine.begin() as conn:
            if "user_id" not in cols:
                if engine.dialect.name == "postgresql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN user_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'"))
                elif engine.dialect.name == "mysql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN user_id VARCHAR(50) NOT NULL DEFAULT 'SYSTEM'"))

            if "created_at" not in cols:
                if engine.dialect.name == "postgresql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT now()"))
                elif engine.dialect.name == "mysql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"))

            if "updated_at" not in cols:
                if engine.dialect.name == "postgresql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN updated_at TIMESTAMP"))
                elif engine.dialect.name == "mysql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN updated_at TIMESTAMP"))

            if "deactivated_at" not in cols:
                if engine.dialect.name == "postgresql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN deactivated_at TIMESTAMP"))
                elif engine.dialect.name == "mysql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN deactivated_at TIMESTAMP"))

            if "enabled" not in cols:
                if engine.dialect.name == "postgresql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE"))
                elif engine.dialect.name == "mysql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE"))
    except Exception as e:
        _log_migration_warning(f"{tbl} audit columns migration warning", e)


def init_db(force: bool = False):
    """
    Initialize database objects for Data_Code:

    1. Build engine (PostgreSQL: ``search_path`` = ``RDS_SCHEMA``).
    2. Ensure PostgreSQL schema exists.
    3. Import ORM models so ``Base.metadata`` is complete.
    4. ``create_all`` for any missing tables.
    5. Run incremental migrations for legacy ``database_connection``, ``file_connection``,
       ``custom_business_checks_config``, and ``system_logs`` tables.

    Call from app startup or scripts **after** ``Data_Code`` is on ``sys.path``.

    Every step below checks state before acting (CREATE ... IF NOT EXISTS,
    count-before-insert, ALTER ... ADD COLUMN-if-missing) -- so re-running
    this against a database that already has data never drops or truncates
    anything; it only ever adds whatever's missing.

    ``force=False`` (default, the HOT PATH -- dc_engine.py calls this first
    thing on every job): a single has_table() check against ``users`` -- if
    it's already there, the schema is assumed already correct (deployment
    already ran with force=True) and every seed/migrate step below is
    skipped. Without this, ~15-20 existence checks ran on every job, which
    adds real per-process connection/catalog-lock pressure once many jobs
    run concurrently in production.

    ``force=True`` (deployment only -- see deploy_init.py): skips that fast
    path and always runs the full sequence, then hard-validates every
    ORM-declared table/column actually exists on the live database
    afterward, raising if anything still doesn't match. That turns an
    incompatible schema into a blocked deployment instead of a runtime crash
    discovered mid-job later (the "column users.email does not exist"
    failure mode seen in practice).
    """
    engine = get_engine()
    schema = os.getenv("RDS_SCHEMA", "public")

    # The monorepo (Drizzle) owns this schema now -- it creates the tables, the
    # enum types and the qc_tags labels. Everything below was written when this
    # engine owned the database, and it still renames database_connection
    # columns, rewrites the config label columns to point at the four *_library
    # tables (which no longer exist) and alters public.results. Running any of
    # that against a monorepo-managed database does not just fail, it damages it.
    #
    # Kept behind a flag rather than deleted so the standalone/offline path still
    # has a way to build a database from nothing.
    # Always needed: validation below walks Base.metadata, and it is only complete
    # once every ORM module has been imported. This touches no database.
    _import_orm_models()

    # The monorepo (Drizzle) owns this schema -- it creates the tables, the enum
    # types and the qc_tags labels. Everything in this block was written when the
    # engine owned the database: it still renames database_connection columns,
    # rewrites config label columns to point at the four *_library tables (which
    # no longer exist) and alters public.results. Running it against a
    # monorepo-managed database does not merely fail, it damages it.
    #
    # Kept behind a flag rather than deleted so a standalone/offline deployment
    # can still build a database from nothing.
    if os.getenv("DC_ENGINE_MANAGE_SCHEMA", "false").strip().lower() in ("1", "true", "yes"):
        _ensure_postgresql_schema(engine)
        _ensure_traditional_checks_library_seq(engine)
        Base.metadata.create_all(engine)
        _seed_traditional_checks_library(engine)
        _seed_label_libraries(engine)
        _migrate_config_label_columns(engine)
        _migrate_database_connection_table(engine)
        _migrate_results_table(engine)
        _migrate_file_connection_table(engine)
        _migrate_custom_check_table(engine)
        _migrate_file_based_checks_table(engine)
        _migrate_db_based_checks_table(engine)
        _migrate_system_logs_table(engine)
        _migrate_validation_logs_table(engine)
        # Add audit columns to config tables
        _add_audit_columns_to_table(engine, "database_connection")
        _add_audit_columns_to_table(engine, "file_connection")
        _add_audit_columns_to_table(engine, "custom_business_checks_config")
        _add_audit_columns_to_table(engine, "file_based_checks_config")
        _add_audit_columns_to_table(engine, "db_based_checks_config")
    else:
        logger.info(
            "init_db: schema management is off (DC_ENGINE_MANAGE_SCHEMA). The "
            "monorepo owns the schema; this call only validates it."
        )

    if force:
        inspector = inspect(engine)
        missing = []
        for table in Base.metadata.tables.values():
            # table.name is the bare table name; table.schema is only set
            # when the model declares __table_args__ = {"schema": ...}
            # explicitly (e.g. Results) -- Base.metadata.tables' dict key is
            # "schema.name" in that case, not a valid has_table()/
            # get_columns() table_name arg on its own.
            table_name = table.name
            table_schema = table.schema or schema
            if not inspector.has_table(table_name, schema=table_schema):
                missing.append(f"{table_schema}.{table_name} (entire table missing)")
                continue
            live_columns = {col["name"] for col in inspector.get_columns(table_name, schema=table_schema)}
            for column in table.columns:
                if column.name not in live_columns:
                    missing.append(f"{table_schema}.{table_name}.{column.name}")
        if missing:
            raise RuntimeError(
                "Schema validation failed after init/migration -- the ORM "
                "expects the following, and it's still missing after the "
                "correction pass (deployment blocked):\n  " + "\n  ".join(missing)
            )

    return engine


def _migrate_results_table(engine):
    """
    Ensure public.results check_execution_id uses PostgreSQL sequence auto increment.
    """

    try:
        if engine.dialect.name != "postgresql":
            return

        with engine.begin() as conn:

            # Create sequence if missing
            conn.execute(text("""
                CREATE SEQUENCE IF NOT EXISTS public.results_check_execution_id_seq;
            """))

            # Set sequence value based on existing maximum ID
            conn.execute(text("""
                SELECT setval(
                    'public.results_check_execution_id_seq',
                    COALESCE(
                        (SELECT MAX(check_execution_id) FROM public.results),
                        0
                    ) + 1,
                    false
                );
            """))

            # Attach sequence as default
            conn.execute(text("""
                ALTER TABLE public.results
                ALTER COLUMN check_execution_id
                SET DEFAULT nextval('public.results_check_execution_id_seq');
            """))

    except Exception as e:
        _log_migration_warning("results table migration warning", e)




def get_db_session():
    """Returns a new SQLAlchemy Session."""
    global _Session

    if _Session is None:
        get_engine()
        _Session = sessionmaker(bind=_engine)

    return _Session()


def _table_columns(engine, table: str) -> dict:
    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        return {}
    return {col["name"]: col for col in inspector.get_columns(table)}


def _migrate_database_connection_table(engine):
    """
    Align legacy ``database_connection`` tables with
    ``Data_Code.connectors.db.models.DatabaseConnection`` and manager expectations:

    - ``database_type`` (not ``connection_config_type``)
    - ``database_name``, ``db_schema``, nullable ``host``/``port`` (Snowflake Option B)
    - ``password``, ``additional_params`` JSON
    """
    tbl = "database_connection"

    def _step(cols_predicate, pg_sql: str, my_sql: str) -> None:
        cols = _table_columns(engine, tbl)
        if not cols or not cols_predicate(cols):
            return
        with engine.begin() as conn:
            if engine.dialect.name == "postgresql":
                conn.execute(text(pg_sql))
            elif engine.dialect.name == "mysql":
                conn.execute(text(my_sql))

    try:
        inspector = inspect(engine)
        table_names = inspector.get_table_names()

        if "connection_template" in table_names and "database_connection" not in table_names:
            with engine.begin() as conn:
                if engine.dialect.name == "postgresql":
                    conn.execute(text("ALTER TABLE connection_template RENAME TO database_connection"))
                elif engine.dialect.name == "mysql":
                    conn.execute(text("RENAME TABLE connection_template TO database_connection"))

        if "database_connection" not in inspect(engine).get_table_names():
            return

        _step(
            lambda c: "connection_template_id" in c and "connection_id" not in c,
            "ALTER TABLE database_connection RENAME COLUMN connection_template_id TO connection_id",
            "ALTER TABLE database_connection CHANGE COLUMN connection_template_id connection_id VARCHAR(50)",
        )
        _step(
            lambda c: "name" in c and "connection_name" not in c,
            "ALTER TABLE database_connection RENAME COLUMN name TO connection_name",
            "ALTER TABLE database_connection CHANGE COLUMN name connection_name VARCHAR(255)",
        )
        _step(
            lambda c: "connection_config_type" in c and "database_type" not in c,
            "ALTER TABLE database_connection RENAME COLUMN connection_config_type TO database_type",
            "ALTER TABLE database_connection CHANGE COLUMN connection_config_type database_type VARCHAR(255)",
        )
        _step(
            lambda c: "db_type" in c and "database_type" not in c and "connection_config_type" not in c,
            "ALTER TABLE database_connection RENAME COLUMN db_type TO database_type",
            "ALTER TABLE database_connection CHANGE COLUMN db_type database_type VARCHAR(255)",
        )
        _step(
            lambda c: "database" in c and "database_name" not in c,
            "ALTER TABLE database_connection RENAME COLUMN database TO database_name",
            "ALTER TABLE database_connection CHANGE COLUMN database database_name VARCHAR(255)",
        )
        _step(
            lambda c: "schema" in c and "db_schema" not in c,
            'ALTER TABLE database_connection RENAME COLUMN "schema" TO db_schema',
            "ALTER TABLE database_connection CHANGE COLUMN `schema` db_schema VARCHAR(255)",
        )
        _step(
            lambda c: "encrypted_password" in c and "password" not in c,
            "ALTER TABLE database_connection RENAME COLUMN encrypted_password TO password",
            "ALTER TABLE database_connection CHANGE COLUMN encrypted_password password TEXT",
        )
        _step(
            lambda c: "additional_params" not in c,
            "ALTER TABLE database_connection ADD COLUMN additional_params JSONB",
            "ALTER TABLE database_connection ADD COLUMN additional_params JSON",
        )
        _step(
            lambda c: "db_schema" not in c,
            "ALTER TABLE database_connection ADD COLUMN db_schema VARCHAR(255) NOT NULL DEFAULT 'public'",
            "ALTER TABLE database_connection ADD COLUMN db_schema VARCHAR(255) NOT NULL DEFAULT 'public'",
        )

        cols = _table_columns(engine, tbl)
        if cols and engine.dialect.name == "postgresql":
            with engine.begin() as conn:
                if "host" in cols:
                    conn.execute(text(f"ALTER TABLE {tbl} ALTER COLUMN host DROP NOT NULL"))
                if "port" in cols:
                    conn.execute(text(f"ALTER TABLE {tbl} ALTER COLUMN port DROP NOT NULL"))
        elif cols and engine.dialect.name == "mysql":
            with engine.begin() as conn:
                if "host" in cols:
                    conn.execute(text(f"ALTER TABLE {tbl} MODIFY COLUMN host VARCHAR(255) NULL"))
                if "port" in cols:
                    conn.execute(text(f"ALTER TABLE {tbl} MODIFY COLUMN port INT NULL"))

        cols = _table_columns(engine, tbl)
        if cols:
            obsolete_cols = ["warehouse", "account", "role", "updated_at", "created_at"]
            for col in obsolete_cols:
                if col in cols:
                    with engine.begin() as conn:
                        conn.execute(text(f"ALTER TABLE {tbl} DROP COLUMN {col}"))

    except Exception as e:
        _log_migration_warning("database_connection migration warning", e)


def _migrate_file_connection_table(engine):
    """
    Align legacy ``file_connection`` with ``Data_Code.connectors.file.models.FileConnection``:

    - ``storage_type`` (replaces ``connection_config_type`` / ``connector_type``)
    - ``additional_params`` JSON (kept / added; never dropped)
    - required credential columns; drop legacy host/port/tenant_id if present
    """
    tbl = "file_connection"

    def _step(cols_predicate, pg_sql: str, my_sql: str) -> None:
        cols = _table_columns(engine, tbl)
        if not cols or not cols_predicate(cols):
            return
        with engine.begin() as conn:
            if engine.dialect.name == "postgresql":
                conn.execute(text(pg_sql))
            elif engine.dialect.name == "mysql":
                conn.execute(text(my_sql))

    try:
        inspector = inspect(engine)
        table_names = inspector.get_table_names()

        if "file_connection_template" in table_names and "file_connection" not in table_names:
            with engine.begin() as conn:
                if engine.dialect.name == "postgresql":
                    conn.execute(text("ALTER TABLE file_connection_template RENAME TO file_connection"))
                elif engine.dialect.name == "mysql":
                    conn.execute(text("RENAME TABLE file_connection_template TO file_connection"))

        if "file_connection" not in inspect(engine).get_table_names():
            return

        _step(
            lambda c: "file_connection_id" in c and "connection_id" not in c,
            f"ALTER TABLE {tbl} RENAME COLUMN file_connection_id TO connection_id",
            f"ALTER TABLE {tbl} CHANGE COLUMN file_connection_id connection_id VARCHAR(50)",
        )
        _step(
            lambda c: "name" in c and "connection_name" not in c,
            f"ALTER TABLE {tbl} RENAME COLUMN name TO connection_name",
            f"ALTER TABLE {tbl} CHANGE COLUMN name connection_name VARCHAR(255)",
        )
        _step(
            lambda c: "storage_type" not in c and "connection_config_type" in c,
            f"ALTER TABLE {tbl} RENAME COLUMN connection_config_type TO storage_type",
            f"ALTER TABLE {tbl} CHANGE COLUMN connection_config_type storage_type VARCHAR(255)",
        )
        _step(
            lambda c: "storage_type" not in c and "connector_type" in c,
            f"ALTER TABLE {tbl} RENAME COLUMN connector_type TO storage_type",
            f"ALTER TABLE {tbl} CHANGE COLUMN connector_type storage_type VARCHAR(255)",
        )
        _step(
            lambda c: "bucket_container_name" in c and "bucket_or_container_name" not in c,
            f"ALTER TABLE {tbl} RENAME COLUMN bucket_container_name TO bucket_or_container_name",
            f"ALTER TABLE {tbl} CHANGE COLUMN bucket_container_name bucket_or_container_name VARCHAR(255)",
        )
        _step(
            lambda c: "bucket_name" in c
            and "bucket_or_container_name" not in c
            and "bucket_container_name" not in c,
            f"ALTER TABLE {tbl} RENAME COLUMN bucket_name TO bucket_or_container_name",
            f"ALTER TABLE {tbl} CHANGE COLUMN bucket_name bucket_or_container_name VARCHAR(255)",
        )
        _step(
            lambda c: "encrypted_secret_access_key" in c and "secret_access_key" not in c,
            f"ALTER TABLE {tbl} RENAME COLUMN encrypted_secret_access_key TO secret_access_key",
            f"ALTER TABLE {tbl} CHANGE COLUMN encrypted_secret_access_key secret_access_key TEXT",
        )
        _step(
            lambda c: "additional_params" not in c,
            f"ALTER TABLE {tbl} ADD COLUMN additional_params JSONB",
            f"ALTER TABLE {tbl} ADD COLUMN additional_params JSON",
        )

        cols = _table_columns(engine, tbl)
        if cols and "schema" in cols:
            with engine.begin() as conn:
                if engine.dialect.name == "postgresql":
                    conn.execute(text(f'ALTER TABLE {tbl} DROP COLUMN "schema"'))
                elif engine.dialect.name == "mysql":
                    conn.execute(text(f"ALTER TABLE {tbl} DROP COLUMN `schema`"))

        for legacy in ("host", "port", "tenant_id", "created_at", "updated_at", "is_active"):
            cols = _table_columns(engine, tbl)
            if cols and legacy in cols:
                with engine.begin() as conn:
                    if engine.dialect.name == "postgresql":
                        conn.execute(text(f'ALTER TABLE {tbl} DROP COLUMN "{legacy}"'))
                    elif engine.dialect.name == "mysql":
                        conn.execute(text(f"ALTER TABLE {tbl} DROP COLUMN `{legacy}`"))

        _migrate_file_connection_endpoint_url_to_additional_params(engine, tbl)

        cols = _table_columns(engine, tbl)
        if cols and "endpoint_url" in cols:
            with engine.begin() as conn:
                if engine.dialect.name == "postgresql":
                    conn.execute(text(f'ALTER TABLE {tbl} DROP COLUMN endpoint_url'))
                elif engine.dialect.name == "mysql":
                    conn.execute(text(f"ALTER TABLE {tbl} DROP COLUMN `endpoint_url`"))

    except Exception as e:
        _log_migration_warning("file_connection migration warning", e)


def _migrate_file_connection_endpoint_url_to_additional_params(engine, tbl: str) -> None:
    """Move legacy endpoint_url column values into additional_params before drop."""
    cols = _table_columns(engine, tbl)
    if not cols or "endpoint_url" not in cols or "additional_params" not in cols:
        return

    import json

    with engine.begin() as conn:
        rows = conn.execute(
            text(
                f"SELECT connection_id, storage_type, endpoint_url, additional_params "
                f"FROM {tbl} WHERE endpoint_url IS NOT NULL AND endpoint_url != ''"
            )
        ).fetchall()

        for row in rows:
            connection_id = row[0]
            storage_type = (row[1] or "").lower()
            endpoint_url = row[2]
            raw_params = row[3]
            if isinstance(raw_params, str):
                try:
                    params = json.loads(raw_params) if raw_params else {}
                except json.JSONDecodeError:
                    params = {}
            else:
                params = dict(raw_params) if raw_params else {}

            if storage_type in ("s3", "local"):
                params.setdefault("endpoint_url", endpoint_url)
            elif storage_type == "azure_blob":
                params.setdefault("account_url", endpoint_url)
            elif storage_type == "sftp":
                parts = str(endpoint_url).split(":", 1)
                params.setdefault("host", parts[0])
                if len(parts) > 1:
                    try:
                        params.setdefault("port", int(parts[1]))
                    except ValueError:
                        params.setdefault("port", 22)
                else:
                    params.setdefault("port", 22)

            if engine.dialect.name == "postgresql":
                conn.execute(
                    text(f"UPDATE {tbl} SET additional_params = CAST(:params AS JSONB) WHERE connection_id = :cid"),
                    {"params": json.dumps(params), "cid": connection_id},
                )
            elif engine.dialect.name == "mysql":
                conn.execute(
                    text(f"UPDATE {tbl} SET additional_params = :params WHERE connection_id = :cid"),
                    {"params": json.dumps(params), "cid": connection_id},
                )


def _migrate_file_based_checks_table(engine):
    """
    Add file_based_checks_config columns that predate a given deployment.

    schema_file_name is deliberately no longer added: column_order and
    column_datatype come from traditional_config_details (or, in the rare
    no-config_id fallback, from a schema file discovered by naming
    convention). The column named a file nothing ever read, so re-adding it on
    every init would keep resurrecting dead metadata. Dropping it from
    existing databases is a migration step, not something done here.
    """
    tbl = "file_based_checks_config"
    try:
        cols = _table_columns(engine, tbl)
        if not cols:
            return
        if "landing_table_name" not in cols:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN landing_table_name VARCHAR(255)"))
    except Exception as e:
        _log_migration_warning(f"{tbl} migration warning", e)


def _migrate_db_based_checks_table(engine):
    """Add schema_table_name column to db_based_checks_config if missing."""
    tbl = "db_based_checks_config"
    try:
        cols = _table_columns(engine, tbl)
        if not cols:
            return
        if "schema_table_name" not in cols:
            with engine.begin() as conn:
                if engine.dialect.name == "postgresql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN schema_table_name VARCHAR(255)"))
                elif engine.dialect.name == "mysql":
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN schema_table_name VARCHAR(255)"))
    except Exception as e:
        _log_migration_warning(f"{tbl} migration warning", e)


def _migrate_custom_check_table(engine):
    """
    Migrate custom_check_template or custom_checks_config table to custom_business_checks_config and handle column renames and additions.
    """
    tbl = "custom_business_checks_config"

    def _step(cols_predicate, pg_sql: str, my_sql: str) -> None:
        cols = _table_columns(engine, tbl)
        if not cols or not cols_predicate(cols):
            return
        with engine.begin() as conn:
            if engine.dialect.name == "postgresql":
                conn.execute(text(pg_sql))
            elif engine.dialect.name == "mysql":
                conn.execute(text(my_sql))

    try:
        inspector = inspect(engine)
        table_names = inspector.get_table_names()

        if "custom_check_template" in table_names and "custom_business_checks_config" not in table_names:
            with engine.begin() as conn:
                if engine.dialect.name == "postgresql":
                    conn.execute(text("ALTER TABLE custom_check_template RENAME TO custom_business_checks_config"))
                elif engine.dialect.name == "mysql":
                    conn.execute(text("RENAME TABLE custom_check_template TO custom_business_checks_config"))
        elif "custom_checks_config" in table_names and "custom_business_checks_config" not in table_names:
            with engine.begin() as conn:
                if engine.dialect.name == "postgresql":
                    conn.execute(text("ALTER TABLE custom_checks_config RENAME TO custom_business_checks_config"))
                elif engine.dialect.name == "mysql":
                    conn.execute(text("RENAME TABLE custom_checks_config TO custom_business_checks_config"))

        if "custom_business_checks_config" not in inspect(engine).get_table_names():
            return

        _step(
            lambda c: "custom_check_id" in c and "check_id" not in c,
            f"ALTER TABLE {tbl} RENAME COLUMN custom_check_id TO check_id",
            f"ALTER TABLE {tbl} CHANGE COLUMN custom_check_id check_id VARCHAR(50)",
        )
        _step(
            lambda c: "name" in c and "check_name" not in c,
            f"ALTER TABLE {tbl} RENAME COLUMN name TO check_name",
            f"ALTER TABLE {tbl} CHANGE COLUMN name check_name VARCHAR(100)",
        )
        _step(
            lambda c: "description" in c and "check_description" not in c,
            f"ALTER TABLE {tbl} RENAME COLUMN description TO check_description",
            f"ALTER TABLE {tbl} CHANGE COLUMN description check_description TEXT",
        )
        _step(
            lambda c: "check_type" in c and "check_category" not in c,
            f"ALTER TABLE {tbl} RENAME COLUMN check_type TO check_category",
            f"ALTER TABLE {tbl} CHANGE COLUMN check_type check_category VARCHAR(50)",
        )
        _step(
            lambda c: "connection_id" not in c,
            f"ALTER TABLE {tbl} ADD COLUMN connection_id VARCHAR(50)",
            f"ALTER TABLE {tbl} ADD COLUMN connection_id VARCHAR(50)",
        )
        _step(
            lambda c: "criticality" not in c,
            f"ALTER TABLE {tbl} ADD COLUMN criticality VARCHAR(50)",
            f"ALTER TABLE {tbl} ADD COLUMN criticality VARCHAR(50)",
        )
        _step(
            lambda c: "data_source" not in c,
            f"ALTER TABLE {tbl} ADD COLUMN data_source VARCHAR(100)",
            f"ALTER TABLE {tbl} ADD COLUMN data_source VARCHAR(100)",
        )
        _step(
            lambda c: "source_or_process" not in c,
            f"ALTER TABLE {tbl} ADD COLUMN source_or_process VARCHAR(50)",
            f"ALTER TABLE {tbl} ADD COLUMN source_or_process VARCHAR(50)",
        )
        _step(
            lambda c: "table_name" not in c,
            f"ALTER TABLE {tbl} ADD COLUMN table_name VARCHAR(100)",
            f"ALTER TABLE {tbl} ADD COLUMN table_name VARCHAR(100)",
        )
        _step(
            lambda c: "connection_id" in c and "source_connection_id" not in c,
            f"ALTER TABLE {tbl} RENAME COLUMN connection_id TO source_connection_id",
            f"ALTER TABLE {tbl} CHANGE COLUMN connection_id source_connection_id VARCHAR(50)",
        )
        _step(
            lambda c: "table_name" in c and "target_table_prefix" not in c,
            f"ALTER TABLE {tbl} RENAME COLUMN table_name TO target_table_prefix",
            f"ALTER TABLE {tbl} CHANGE COLUMN table_name target_table_prefix VARCHAR(100)",
        )
        _step(
            lambda c: "source_or_process" in c and "impacted_downstream" not in c,
            f"ALTER TABLE {tbl} RENAME COLUMN source_or_process TO impacted_downstream",
            f"ALTER TABLE {tbl} CHANGE COLUMN source_or_process impacted_downstream VARCHAR(50)",
        )
        _step(
            lambda c: "source_connection_id" not in c,
            f"ALTER TABLE {tbl} ADD COLUMN source_connection_id VARCHAR(50)",
            f"ALTER TABLE {tbl} ADD COLUMN source_connection_id VARCHAR(50)",
        )
        _step(
            lambda c: "target_connection_id" not in c,
            f"ALTER TABLE {tbl} ADD COLUMN target_connection_id VARCHAR(50)",
            f"ALTER TABLE {tbl} ADD COLUMN target_connection_id VARCHAR(50)",
        )
        _step(
            lambda c: "target_table_prefix" not in c,
            f"ALTER TABLE {tbl} ADD COLUMN target_table_prefix VARCHAR(100)",
            f"ALTER TABLE {tbl} ADD COLUMN target_table_prefix VARCHAR(100)",
        )
        _step(
            lambda c: "impacted_downstream" not in c,
            f"ALTER TABLE {tbl} ADD COLUMN impacted_downstream VARCHAR(50)",
            f"ALTER TABLE {tbl} ADD COLUMN impacted_downstream VARCHAR(50)",
        )

        cols = _table_columns(engine, tbl)
        if cols and "created_at" in cols:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {tbl} DROP COLUMN created_at"))
        cols = _table_columns(engine, tbl)
        if cols and "id" in cols:
            with engine.begin() as conn:
                if engine.dialect.name == "postgresql":
                    conn.execute(text(f'ALTER TABLE {tbl} DROP COLUMN "id"'))
                elif engine.dialect.name == "mysql":
                    conn.execute(text(f"ALTER TABLE {tbl} DROP COLUMN `id`"))

    except Exception as e:
        _log_migration_warning("Custom check migration warning", e)


def _serialize_log_context(context: Any) -> Optional[str]:
    if context is None:
        return None
    try:
        return json.dumps(context, default=str)
    except Exception:
        return json.dumps(str(context))


def _log_to_mapping(entry: Any) -> Dict[str, Any]:
    if hasattr(entry, "model_dump"):
        return entry.model_dump()
    if hasattr(entry, "dict"):
        return entry.dict()
    if isinstance(entry, dict):
        return entry
    return dict(entry)


def persist_job_logs(
    job_id: str,
    system_logs: List[Any],
    validation_logs: List[Any],
    user_id: Optional[str] = None,
) -> Dict[str, int]:
    """Persist system and validation logs in bulk at the end of a job run."""
    db = get_db_session()
    try:
        flush_timestamp = datetime.utcnow()

        system_rows: List[Dict[str, Any]] = []
        for entry in system_logs or []:
            data = _log_to_mapping(entry)
            system_rows.append({
                "id": data.get("id", str(uuid.uuid4())),
                "job_id": data.get("job_id", job_id),
                "user_id": data.get("user_id", user_id),
                "timestamp": data.get("timestamp", datetime.utcnow()),
                "code": data.get("code", "UNKNOWN"),
                "severity": data.get("severity", "INFO"),
                "message": data.get("message", ""),
                "context_json": _serialize_log_context(data.get("context")),
                "flushed_at": flush_timestamp,
            })

        validation_rows: List[Dict[str, Any]] = []
        for entry in validation_logs or []:
            data = _log_to_mapping(entry)
            validation_rows.append({
                "id": data.get("id", str(uuid.uuid4())),
                "job_id": data.get("job_id", job_id),
                "user_id": data.get("user_id", user_id),
                "timestamp": data.get("timestamp", datetime.utcnow()),
                "message": data.get("message", ""),
                "context_json": _serialize_log_context(data.get("context")),
                "flushed_at": flush_timestamp,
            })

        if system_rows:
            db.bulk_insert_mappings(SystemLogRecord, system_rows)
        if validation_rows:
            db.bulk_insert_mappings(ValidationLogRecord, validation_rows)
        db.commit()
        return {"system": len(system_rows), "validation": len(validation_rows)}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
