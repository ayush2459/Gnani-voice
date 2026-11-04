from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CustomerChoiceCreate(BaseModel):
    voice_session_id: UUID | None = None
    choice_type: str = Field(min_length=1, max_length=80)
    selected_option: str = Field(min_length=1, max_length=150)
    choice_data: dict[str, Any] = Field(default_factory=dict)


class CustomerChoiceResponse(BaseModel):
    id: UUID
    case_id: UUID
    voice_session_id: UUID | None
    choice_type: str
    selected_option: str
    choice_data: dict[str, Any]
    confirmation_status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)