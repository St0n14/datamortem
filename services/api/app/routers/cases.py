# app/routers/cases.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from datetime import datetime

from ..db import SessionLocal
from ..models import Case

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

class CaseOut(BaseModel):
    case_id: str
    status: str
    created_at_utc: datetime
    note: Optional[str] = None

    class Config:
        from_attributes = True

# ---------- Routes ----------

@router.get("/cases", response_model=List[CaseOut])
def list_cases(db: Session = Depends(get_db)):
    rows = db.query(Case).all()
    return rows

@router.post("/cases", response_model=CaseOut, status_code=201)
def create_case(payload: CaseIn, db: Session = Depends(get_db)):
    # refuse doublon case_id
    existing = db.query(Case).filter_by(case_id=payload.case_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="case_id already exists")

    c = Case(
        case_id=payload.case_id,
        note=payload.note,
        status="open",
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c
