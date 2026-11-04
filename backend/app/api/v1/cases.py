from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import RecoveryCase, CaseEvent
from app.schemas import RecoveryCaseCreate, RecoveryCaseResponse
from app.schemas import CaseEventResponse

router = APIRouter(prefix="/cases", tags=["Recovery Cases"])


@router.post(
    "",
    response_model=RecoveryCaseResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_case(
    payload: RecoveryCaseCreate,
    db: Session = Depends(get_db),
):
    case = RecoveryCase(
        **payload.model_dump(),
        status="detected",
    )

    db.add(case)

    try:
        db.flush()

        event = CaseEvent(
            case_id=case.id,
            event_type="case_detected",
            message="Failed transaction registered in RescueFlow.",
            actor="system",
            event_data={
                "failure_type": case.failure_type,
                "severity": case.severity,
            },
        )

        db.add(event)
        db.commit()
        db.refresh(case)

        return case

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A case with this external transaction ID already exists.",
        )


@router.get("", response_model=list[RecoveryCaseResponse])
def list_cases(
    db: Session = Depends(get_db),
):
    statement = (
        select(RecoveryCase)
        .order_by(RecoveryCase.created_at.desc())
    )

    return db.scalars(statement).all()


@router.get("/{case_id}", response_model=RecoveryCaseResponse)
def get_case(
    case_id: UUID,
    db: Session = Depends(get_db),
):
    case = db.get(RecoveryCase, case_id)

    if case is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recovery case not found.",
        )

    return case


@router.get(
    "/{case_id}/events",
    response_model=list[CaseEventResponse],
)
def get_case_events(
    case_id: UUID,
    db: Session = Depends(get_db),
):
    if db.get(RecoveryCase, case_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recovery case not found.",
        )

    statement = (
        select(CaseEvent)
        .where(CaseEvent.case_id == case_id)
        .order_by(CaseEvent.created_at.asc())
    )

    return db.scalars(statement).all()