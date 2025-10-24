from fastapi import APIRouter, Depends
from ..db import SessionLocal
from ..models import Case

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/")
def list_cases(db=Depends(get_db)):
    rows = db.query(Case).all()
    return [
        {
            "case_id": r.case_id,
            "customer_name": r.customer_name,
            "incident_start_utc": r.incident_start_utc.isoformat() + "Z",
            "created_at_utc": r.created_at_utc.isoformat() + "Z",
        }
        for r in rows
    ]
