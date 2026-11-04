from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RecoveryActionCreate(BaseModel):
    action_type: str = Field(min_length=1, max_length=80)
    idempotency_key: str = Field(min_length=1, max_length=180)
    request_data: dict[str, Any] = Field(default_factory=dict)


class RecoveryActionResponse(BaseModel):
    id: UUID
    case_id: UUID
    action_type: str
    status: str
    idempotency_key: str
    request_data: dict[str, Any]
    result_data: dict[str, Any]
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None

    model_config = ConfigDict(from_attributes=True)