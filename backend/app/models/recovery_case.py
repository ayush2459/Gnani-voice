import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base


class RecoveryCase(Base):
    __tablename__ = "recovery_cases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_transaction_id: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    customer_reference: Mapped[str | None] = mapped_column(String(150))
    order_reference: Mapped[str | None] = mapped_column(String(150))
    payment_reference: Mapped[str | None] = mapped_column(String(150))
    failure_type: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="detected")
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    description: Mapped[str | None] = mapped_column(Text)
    context: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("ix_recovery_cases_status_created", "status", "created_at"),
    )
