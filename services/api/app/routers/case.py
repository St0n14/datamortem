from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session
from typing import List
from ..db import SessionLocal
from ..models import Case, User
from ..auth.dependencies import get_current_active_user
from ..auth.permissions import ensure_case_access_by_id, ensure_has_write_permissions, is_admin_user
from datetime import datetime
from ..services.hedgedoc import hedgedoc_manager, HedgeDocNoteMeta

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
    model_config = ConfigDict(from_attributes=True)
    case_id: str
    status: str
    created_at_utc: datetime
    note: str | None
    hedgedoc_url: str | None = None


def serialize_case(case: Case) -> CaseOut:
    return CaseOut(
        case_id=case.case_id,
        status=case.status,
        created_at_utc=case.created_at_utc,
        note=case.note,
        hedgedoc_url=hedgedoc_manager.build_share_url(case.hedgedoc_slug),
    )


def provision_unique_note(db: Session, case_identifier: str) -> HedgeDocNoteMeta | None:
    if not hedgedoc_manager.enabled:
        return None

    note_meta: HedgeDocNoteMeta | None = None
    for _ in range(3):
        note_meta = hedgedoc_manager.provision_case_note(case_identifier)
        if not note_meta or not note_meta.slug:
            return note_meta
        existing = db.query(Case).filter(Case.hedgedoc_slug == note_meta.slug).first()
        if not existing:
            return note_meta
    return note_meta

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
    return [serialize_case(row) for row in rows]

@router.post("/cases", response_model=CaseOut)
def create_case(
    payload: CaseIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new case (requires authentication)."""
    ensure_has_write_permissions(current_user)
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

    note_meta = provision_unique_note(db, payload.case_id)

    c = Case(
        case_id=payload.case_id,
        note=payload.note,
        status="open",
        owner_id=current_user.id,  # Associate case with current user
        hedgedoc_slug=note_meta.slug if note_meta else None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    response = serialize_case(c)
    if response.hedgedoc_url is None and note_meta and note_meta.url:
        response.hedgedoc_url = note_meta.url
    return response


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
    return serialize_case(case)


@router.patch("/cases/{case_id}", response_model=CaseOut)
def update_case(
    case_id: str,
    payload: CaseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a case (requires authentication and access)."""
    ensure_has_write_permissions(current_user)
    case = ensure_case_access_by_id(case_id, current_user, db)

    if payload.note is not None:
        case.note = payload.note
    if payload.status is not None:
        case.status = payload.status

    db.commit()
    db.refresh(case)
    return serialize_case(case)


@router.delete("/cases/{case_id}", status_code=204)
def delete_case(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a case (requires authentication and access)."""
    ensure_has_write_permissions(current_user)
    case = ensure_case_access_by_id(case_id, current_user, db)

    db.delete(case)
    db.commit()
    return None
