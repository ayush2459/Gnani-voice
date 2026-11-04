import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base


class CustomerChoice(Base):
    __tablename__ = "customer_choices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("recovery_cases.id", ondelete="CASCADE"), nullable=False)
    voice_session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("voice_sessions.id", ondelete="SET NULL"))
    choice_type: Mapped[str] = mapped_column(String(80), nullable=False)
    selected_option: Mapped[str] = mapped_column(String(150), nullable=False)
    choice_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    confirmation_status: Mapped[str] = mapped_column(String(40), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
