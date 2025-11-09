from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List
from ..db import SessionLocal
from ..models import Case, User
from ..auth.dependencies import get_current_active_user
from ..auth.permissions import is_admin_user, ensure_case_access_by_id
from datetime import datetime

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class CaseIn(BaseModel):
    case_id: str
    note: str | None = None

class CaseOut(BaseModel):
    case_id: str
    status: str
    created_at_utc: datetime
    note: str | None

@router.get("/cases", response_model=List[CaseOut])
def list_cases(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """List all cases (requires authentication)."""
    query = db.query(Case)
    if not is_admin_user(current_user):
        query = query.filter(Case.owner_id == current_user.id)
    rows = query.all()
    return rows

@router.post("/cases", response_model=CaseOut)
def create_case(
    payload: CaseIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new case (requires authentication)."""
    if not is_admin_user(current_user):
        owned_count = db.query(Case).filter(Case.owner_id == current_user.id).count()
        if owned_count >= 1:
            raise HTTPException(
                status_code=403,
                detail="Standard users may only own a single case."
            )
    # Check if case_id already exists
    existing = db.query(Case).filter(Case.case_id == payload.case_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="case_id already exists")

    c = Case(
        case_id=payload.case_id,
        note=payload.note,
        status="open",
        owner_id=current_user.id  # Associate case with current user
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


class CaseUpdate(BaseModel):
    note: str | None = None
    status: str | None = None


@router.get("/cases/{case_id}", response_model=CaseOut)
def get_case(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get a single case by ID (requires authentication and access)."""
    case = ensure_case_access_by_id(case_id, current_user, db)
    return case


@router.patch("/cases/{case_id}", response_model=CaseOut)
def update_case(
    case_id: str,
    payload: CaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a case (requires authentication and access)."""
    case = ensure_case_access_by_id(case_id, current_user, db)

    if payload.note is not None:
        case.note = payload.note
    if payload.status is not None:
        case.status = payload.status

    db.commit()
    db.refresh(case)
    return case


@router.delete("/cases/{case_id}", status_code=204)
def delete_case(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a case (requires authentication and access)."""
    case = ensure_case_access_by_id(case_id, current_user, db)

    db.delete(case)
    db.commit()
    return None
