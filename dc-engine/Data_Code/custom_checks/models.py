from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy import Column, String, Text, DateTime, Boolean, Integer, ForeignKey, func, text
from datetime import datetime
from Data_Code.common.database import Base


class CustomCheckConfig(Base):
    """
    ORM for the ``custom_business_checks_config`` table.

    Stores definitions of custom SQL business checks. Dimension columns
    (``check_category``, ``workstream``, ``data_source``) are FK ids into the
    label-lookup tables (``category_label_library`` / ``workstream_library`` /
    ``data_source_library``) -- matched to the real RDS dev database, which has
    already migrated these 3 columns to integers on this table specifically.
    ``impacted_downstream`` is an FK id into ``impacted_downstream_library``
    too, so all four label dimensions behave the same way. It is nullable, a
    consent-recorded deviation from the senior schema's ``not null``.
    ``source_connection_id`` and ``target_connection_id``
    reference ``database_connection`` / ``file_connection`` rows by ``connection_id``.
    """

    __tablename__ = "custom_business_checks_config"

    check_id = Column(String(50), primary_key=True, nullable=False)
    check_name = Column(String(255), nullable=False)
    check_description = Column(Text, nullable=True)
    check_category = Column(Integer, ForeignKey("qc_tags.id"), nullable=False)
    workstream = Column(Integer, ForeignKey("qc_tags.id"), nullable=False)
    impacted_downstream = Column(ARRAY(Integer), nullable=False)
    data_source = Column(Integer, ForeignKey("qc_tags.id"), nullable=False)
    source_connection_id = Column(String(50), nullable=False)
    target_connection_id = Column(String(50), nullable=False)
    target_table_prefix = Column(String(100), nullable=False)
    sql_query = Column(Text, nullable=False)
    # NOT a column: custom_business_checks_config has no source_table_name in the
    # database (the monorepo owns that schema and never defined one), so mapping
    # it made every SELECT through this model fail with UndefinedColumn.
    #
    # Nothing is lost by dropping it: the execution path already re-derives the
    # source table from sql_query on each run via _extract_source_table_name, so
    # the stored copy was written but never read back. Kept as a plain attribute
    # so the existing create/update code can still set it in memory.
    source_table_name = None
    criticality = Column(String(50), nullable=False)
    error_message = Column(String(500), nullable=False)
    user_id = Column(String(50), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    deactivated_at = Column(DateTime, nullable=True)
    enabled = Column(Boolean, nullable=False, default=True, server_default=text("TRUE"))

    def to_dict(self):
        """Serialize row; includes legacy keys used by older execution paths."""
        return {
            "check_id": self.check_id,
            "check_name": self.check_name,
            "check_description": self.check_description,
            "check_category": self.check_category,
            "workstream": self.workstream,
            "impacted_downstream": self.impacted_downstream,
            "data_source": self.data_source,
            "source_connection_id": self.source_connection_id,
            "target_connection_id": self.target_connection_id,
            "target_table_prefix": self.target_table_prefix,
            "table_name_prefix": self.target_table_prefix,
            "sql_query": self.sql_query,
            "source_table_name": self.source_table_name,
            "criticality": self.criticality,
            "error_message": self.error_message,
            # Legacy aliases (connection_id / table_name / source_or_process)
            "connection_id": self.source_connection_id,
            "table_name": self.target_table_prefix,
            "source_or_process": self.impacted_downstream,
        }
