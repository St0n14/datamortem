from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from datetime import datetime

from ..db import get_db
from ..models import AnalysisModule

router = APIRouter()

@router.get("/")
def list_modules(db: Session = Depends(get_db)):
    modules = db.execute(select(AnalysisModule)).scalars().all()
    return [
        {
            "name": m.name,
            "description": m.description,
            "enabled": m.enabled,
            "created_at_utc": m.created_at_utc.isoformat() + "Z",
            "updated_at_utc": m.updated_at_utc.isoformat() + "Z" if m.updated_at_utc else None,
        }
        for m in modules
    ]

@router.post("/")
def create_module(
    name: str,
    description: str,
    enabled: bool = True,
    db: Session = Depends(get_db),
):
    mod = AnalysisModule(
        name=name,
        description=description,
        enabled=enabled,
        created_at_utc=datetime.utcnow(),
        updated_at_utc=datetime.utcnow(),
    )
    db.add(mod)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Module name already exists")
    return {
        "status": "created",
        "name": mod.name,
        "description": mod.description,
        "enabled": mod.enabled,
    }
