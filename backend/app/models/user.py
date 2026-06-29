import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class UserRole(str, Enum):
    USER = "USER"
    ADMIN = "ADMIN"
    SYSTEM = "SYSTEM"


class User(SQLModel, table=True):
    __tablename__ = "users"
    __table_args__ = (
        sa.UniqueConstraint("login_id", "tenant_id", name="uq_users_login_id_tenant_id"),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=sa.Column(
            sa.UUID,
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
    )
    login_id: str = Field(max_length=255)
    tenant_id: str = Field(
        sa_column=sa.Column(
            sa.String(32),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    name: str = Field(max_length=255)
    password: str = Field(max_length=255)
    role: UserRole = Field(
        sa_column=sa.Column(
            sa.Enum(UserRole, name="userrole", create_type=True),
            nullable=False,
        ),
    )
    login_key: str | None = Field(default=None, max_length=32)
    is_required_password_reset: bool = Field(
        default=True,
        sa_column=sa.Column(sa.Boolean, nullable=False, server_default=sa.true()),
    )
    created_at: datetime = Field(
        sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    updated_at: datetime = Field(
        sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
