from sqlalchemy import Column, String, Text, JSON, DateTime, Boolean
from datetime import datetime
from Data_Code.common.database import Base

class FileConnection(Base):
    """Model matching the existing file_connection table in RDS exactly."""

    __tablename__ = 'file_connection'

    connection_id = Column(String(50), primary_key=True)  # FC001, FC002
    connection_name = Column(String(255), nullable=False)
    storage_type = Column(String(255), nullable=False)
    bucket_or_container_name = Column(String(255), nullable=False)
    region = Column(String(255), nullable=False)
    access_key_id = Column(String(255), nullable=False)
    secret_access_key = Column(Text, nullable=False)
    additional_params = Column(JSON)
    user_id = Column(String(50), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)
    deactivated_at = Column(DateTime, nullable=True)
    enabled = Column(Boolean, nullable=False, default=True)

    def to_dict(self):
        """Convert model to dictionary (excluding secret)."""
        return {
            "connection_id": self.connection_id,
            "connection_name": self.connection_name,
            "storage_type": self.storage_type,
            "bucket_or_container_name": self.bucket_or_container_name,
            "region": self.region,
            "access_key_id": self.access_key_id,
            "additional_params": self.additional_params,
        }
