from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List
from ..db import SessionLocal
from ..models import Case
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
def list_cases(db: Session = Depends(get_db)):
    rows = db.query(Case).all()
    return rows

@router.post("/cases", response_model=CaseOut)
def create_case(payload: CaseIn, db: Session = Depends(get_db)):
    c = Case(
        case_id=payload.case_id,
        note=payload.note,
        status="open",
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c
