import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.base import Base


class VoiceSession(Base):
    __tablename__ = "voice_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("recovery_cases.id", ondelete="CASCADE"), nullable=False)
    provider: Mapped[str] = mapped_column(String(60), nullable=False, default="gnani")
    provider_session_id: Mapped[str | None] = mapped_column(String(180))
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="initiated")
    transcript: Mapped[str | None] = mapped_column(Text)
    outcome: Mapped[str | None] = mapped_column(String(80))
    session_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
