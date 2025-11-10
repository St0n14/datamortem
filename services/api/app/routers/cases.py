# app/routers/cases.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from sqlalchemy.orm import Session
from datetime import datetime

from ..db import SessionLocal
from ..models import Case
from ..services.hedgedoc import hedgedoc_manager, HedgeDocNoteMeta

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ---------- Schemas ----------

class CaseIn(BaseModel):
    case_id: str
    note: Optional[str] = None


class CaseUpdate(BaseModel):
    note: Optional[str] = None
    status: Optional[str] = None


class CaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    case_id: str
    status: str
    created_at_utc: datetime
    note: Optional[str] = None
    hedgedoc_url: Optional[str] = None


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

# ---------- Routes ----------

@router.get("/cases", response_model=List[CaseOut])
def list_cases(db: Session = Depends(get_db)):
    rows = db.query(Case).all()
    return [serialize_case(row) for row in rows]

@router.post("/cases", response_model=CaseOut, status_code=201)
def create_case(payload: CaseIn, db: Session = Depends(get_db)):
    # refuse doublon case_id
    existing = db.query(Case).filter_by(case_id=payload.case_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="case_id already exists")

    note_meta = provision_unique_note(db, payload.case_id)

    c = Case(
        case_id=payload.case_id,
        note=payload.note,
        status="open",
        hedgedoc_slug=note_meta.slug if note_meta else None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    response = serialize_case(c)
    if response.hedgedoc_url is None and note_meta and note_meta.url:
        response.hedgedoc_url = note_meta.url
    return response


@router.get("/cases/{case_id}", response_model=CaseOut)
def get_case(case_id: str, db: Session = Depends(get_db)):
    case = db.query(Case).filter_by(case_id=case_id).one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="case not found")
    return serialize_case(case)


@router.patch("/cases/{case_id}", response_model=CaseOut)
def update_case(case_id: str, payload: CaseUpdate, db: Session = Depends(get_db)):
    case = db.query(Case).filter_by(case_id=case_id).one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="case not found")

    if payload.note is not None:
        case.note = payload.note
    if payload.status is not None:
        case.status = payload.status

    db.commit()
    db.refresh(case)
    return serialize_case(case)


@router.delete("/cases/{case_id}", status_code=204)
def delete_case(case_id: str, db: Session = Depends(get_db)):
    case = db.query(Case).filter_by(case_id=case_id).one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="case not found")

    db.delete(case)
    db.commit()
    return None
