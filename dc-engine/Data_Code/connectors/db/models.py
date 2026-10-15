from sqlalchemy import Column, String, Integer, Text, JSON, DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from datetime import datetime
from Data_Code.common.database import Base

class DatabaseConnection(Base):
    """
    ORM for the ``database_connection`` table.

    **Host / port (Option B):** For ``snowflake``, ``host`` and ``port`` are **nullable**
    in the database and unused at runtime; connection uses ``additional_params`` (e.g.
    ``account``). For ``postgresql``, ``mysql``, and ``rds``, host and port are **required**
    and enforced in application validation on save/test (not by NOT NULL on those types alone).

    **additional_params (JSON):** Connector-specific options merged into the runtime
    config by ``build_connector_config`` in the same module. Contract (keys by type):

    - **snowflake:** ``account`` (required), ``warehouse``, ``role``, and ``auth_method``
      (``"key_pair"`` default, or ``"password"``) -- selects how the ``password`` column
      is interpreted (encrypted PEM private key vs. encrypted plain password); the
      column itself carries no type information, only ``additional_params.auth_method``
      does. See ``Data_Code/connectors/db/connectors.py::load_config``.
    - **postgresql:** ``sslmode``, ``sslrootcert``, ``connect_timeout``, ``application_name``, …
    - **mysql:** ``ssl``, ``ssl_ca``, ``connect_timeout``, ``charset``, …
    - **rds:** ``engine`` (``postgresql`` | ``mysql``) when not defaulted.
    """

    __tablename__ = 'database_connection'

    connection_id = Column(String(50), primary_key=True)  # DB001, DB002
    connection_name = Column(String(255), nullable=False)
    database_type = Column(String(255), nullable=False)  # rds, postgresql, snowflake, etc.
    host = Column(String(255), nullable=True)
    port = Column(Integer, nullable=True)
    database_name = Column(String(255), nullable=False)
    username = Column(String(255), nullable=False)
    # Renamed from `password`: this column holds whichever credential the
    # connection uses -- a database password, a Snowflake password, or a
    # Snowflake RSA private key -- always encrypted. `secret_type` says which,
    # alongside additional_params.auth_method which this engine already reads.
    secret = Column(Text, nullable=False)
    secret_type = Column(String(50), nullable=False, server_default='password')
    db_schema = Column(String(255), nullable=False)
    additional_params = Column(JSON)
    # User who created/updated the connection, with a real FK to users.id so
    # every connection is attributable (fix B4).
    #
    # Nullable is a consent-recorded deviation from the senior schema's
    # `not null`: the legacy "system" placeholder is not a users row, so it is
    # stored as NULL rather than as a value no user will ever match (see
    # _normalize_user_id in manager.py). Existing system-owned and orphan rows
    # therefore migrate without blocking. Flipping to NOT NULL is a separate
    # step, once every row has been reattributed to a real user.
    user_id = Column(PG_UUID(as_uuid=False), ForeignKey("users.id"), nullable=True, default=None)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    deactivated_at = Column(DateTime, nullable=True)
    enabled = Column(Boolean, nullable=False, default=True)

    def to_dict(self):
        """Convert model to dictionary (excluding the secret)."""
        return {
            "connection_id": self.connection_id,
            "connection_name": self.connection_name,
            "database_type": self.database_type,
            "host": self.host,
            "port": self.port,
            "database_name": self.database_name,
            "username": self.username,
            "db_schema": self.db_schema,
            "additional_params": self.additional_params,
        }
