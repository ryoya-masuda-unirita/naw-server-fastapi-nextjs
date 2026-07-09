import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class UserImportJobStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class UserImportJob(SQLModel, table=True):
    __tablename__ = "user_import_jobs"

    id: str = Field(
        max_length=32, primary_key=True, default_factory=lambda: uuid.uuid4().hex
    )
    tenant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    status: UserImportJobStatus = Field(
        sa_column=sa.Column(
            sa.Enum(UserImportJobStatus, name="userimportjobstatus", create_type=True),
            nullable=False,
        ),
    )
    file_name: str = Field(max_length=255)
    storage_url: str | None = Field(default=None, max_length=2048)
    error_details: str | None = Field(
        default=None, sa_column=sa.Column(sa.Text, nullable=True)
    )
    created_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    updated_at: datetime = Field(
        sa_column=sa.Column(
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
    queued_at: datetime | None = Field(
        default=None, sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True)
    )
    completed_at: datetime | None = Field(
        default=None, sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True)
    )
