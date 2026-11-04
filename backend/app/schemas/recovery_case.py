from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RecoveryCaseCreate(BaseModel):
    external_transaction_id: str = Field(min_length=1, max_length=150)
    customer_reference: str | None = None
    order_reference: str | None = None
    payment_reference: str | None = None

    failure_type: str = Field(min_length=1, max_length=80)
    severity: str = "medium"
    description: str | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class RecoveryCaseResponse(BaseModel):
    id: UUID
    external_transaction_id: str
    customer_reference: str | None
    order_reference: str | None
    payment_reference: str | None
    failure_type: str
    status: str
    severity: str
    description: str | None
    context: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)