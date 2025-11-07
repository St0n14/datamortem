# app/routers/events.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy import select
from datetime import datetime
import json

from ..db import SessionLocal
from ..models import Event, Case

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ---------- Schemas ----------

class EventIn(BaseModel):
    ts: str
    source: str
    message: str
    host: str
    user: Optional[str] = None
    tags: List[str] = []
    score: Optional[int] = None
    case_id: str
    evidence_uid: Optional[str] = None
    raw: Optional[Any] = None  # dict / str / whatever

class EventOut(BaseModel):
    id: int
    ts: str
    source: str
    message: str
    host: str
    user: Optional[str] = None
    tags: List[str] = []
    score: Optional[int] = None
    case_id: Optional[str] = None
    evidence_uid: Optional[str] = None
    raw: Optional[Any] = None

    class Config:
        from_attributes = True

# ---------- Routes ----------

@router.get("/events", response_model=List[EventOut])
def list_events(case_id: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Récupère les events, optionnellement filtré par case_id.
    Re-transforme tags (str JSON en DB) -> list[str] pour le front.
    """
    q = db.query(Event).order_by(Event.id.asc())
    if case_id:
        q = q.filter(Event.case_id == case_id)
    rows = q.all()

    out: List[EventOut] = []
    for e in rows:
        # tags en DB = string JSON ou None
        if isinstance(e.tags, str):
            try:
                parsed_tags = json.loads(e.tags)
            except Exception:
                parsed_tags = []
        else:
            parsed_tags = e.tags or []

        # raw en DB = string JSON ou None
        if isinstance(e.raw, str):
            try:
                parsed_raw = json.loads(e.raw)
            except Exception:
                parsed_raw = e.raw
        else:
            parsed_raw = e.raw

        out.append(
            EventOut(
                id=e.id,
                ts=e.ts,
                source=e.source,
                message=e.message,
                host=e.host,
                user=e.user,
                tags=parsed_tags,
                score=e.score,
                case_id=e.case_id,
                evidence_uid=e.evidence_uid,
                raw=parsed_raw,
            )
        )
    return out


@router.post("/events/ingest")
def ingest_events(payload: List[EventIn], db: Session = Depends(get_db)):
    """
    Ingestion d'une liste d'events.
    - Vérifie que le case_id existe
    - Sérialise tags (list[str]) en texte JSON
    - Sérialise raw (dict) en texte JSON
    """
    new_objs = []
    now_utc = datetime.utcnow()

    for ev in payload:
        # validate case
        case_exists = db.execute(
            select(Case).where(Case.case_id == ev.case_id)
        ).scalar_one_or_none()
        if not case_exists:
            raise HTTPException(
                status_code=400,
                detail=f"case_id '{ev.case_id}' does not exist"
            )

        tags_text = json.dumps(ev.tags) if ev.tags else None

        if ev.raw is None:
            raw_text = None
        elif isinstance(ev.raw, str):
            raw_text = ev.raw
        else:
            raw_text = json.dumps(ev.raw)

        obj = Event(
            ts=ev.ts,
            source=ev.source,
            message=ev.message,
            host=ev.host,
            user=ev.user,
            tags=tags_text,  # <- now string
            score=ev.score,
            case_id=ev.case_id,
            evidence_uid=ev.evidence_uid,
            raw=raw_text,    # <- now string
            created_at_utc=now_utc,
        )
        new_objs.append(obj)

    db.add_all(new_objs)
    db.commit()

    return {"ok": True, "ingested": len(new_objs)}
