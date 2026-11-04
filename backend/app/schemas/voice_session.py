from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class VoiceSessionCreate(BaseModel):
    provider: str = "gnani"
    provider_session_id: str | None = None
    session_metadata: dict[str, Any] = Field(default_factory=dict)


class VoiceSessionResponse(BaseModel):
    id: UUID
    case_id: UUID
    provider: str
    provider_session_id: str | None
    status: str
    transcript: str | None
    outcome: str | None
    session_metadata: dict[str, Any]
    started_at: datetime
    ended_at: datetime | None

    model_config = ConfigDict(from_attributes=True)