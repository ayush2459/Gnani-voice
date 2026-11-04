from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CaseEventCreate(BaseModel):
    event_type: str = Field(min_length=1, max_length=80)
    message: str = Field(min_length=1)
    actor: str = "system"
    event_data: dict[str, Any] = Field(default_factory=dict)


class CaseEventResponse(BaseModel):
    id: UUID
    case_id: UUID
    event_type: str
    message: str
    actor: str
    event_data: dict[str, Any]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)