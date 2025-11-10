# app/routers/events.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy import select
from datetime import datetime
import json
import logging

from ..db import SessionLocal
from ..models import Event, Case, User
from ..auth.dependencies import get_current_active_user
from ..auth.permissions import (
    ensure_case_access,
    ensure_case_access_by_id,
    get_accessible_case_ids,
    is_admin_user,
)
from ..opensearch.client import get_opensearch_client
from ..opensearch.indexer import index_events_batch
from ..config import settings

logger = logging.getLogger(__name__)

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
def list_events(
    case_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Récupère les events, optionnellement filtré par case_id.
    Re-transforme tags (str JSON en DB) -> list[str] pour le front.
    """
    query = db.query(Event).order_by(Event.id.asc())
    if case_id:
        ensure_case_access_by_id(case_id, current_user, db)
        query = query.filter(Event.case_id == case_id)
    elif not is_admin_user(current_user):
        accessible_case_ids = get_accessible_case_ids(db, current_user)
        if not accessible_case_ids:
            return []
        query = query.filter(Event.case_id.in_(accessible_case_ids))
    rows = query.all()

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
def ingest_events(
    payload: List[EventIn],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Ingestion d'une liste d'events.
    RESTRICTION: Réservé aux administrateurs uniquement.
    Les scripts de pipeline utilisent l'indexation directe OpenSearch.

    - Vérifie que le case_id existe
    - Sérialise tags (list[str]) en texte JSON
    - Sérialise raw (dict) en texte JSON
    """
    # Vérification admin uniquement
    if not is_admin_user(current_user):
        raise HTTPException(
            status_code=403,
            detail="Event ingestion is restricted to administrators only"
        )

    new_objs = []
    now_utc = datetime.utcnow()

    for ev in payload:
        # validate case
        case_exists = db.execute(
            select(Case).where(Case.case_id == ev.case_id)
        ).scalar_one_or_none()
        ensure_case_access(case_exists, current_user)

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

    # Indexer les événements dans OpenSearch
    # Groupe par case_id pour l'indexation
    events_by_case = {}
    for ev in payload:
        if ev.case_id not in events_by_case:
            events_by_case[ev.case_id] = []
        events_by_case[ev.case_id].append(ev.dict())

    # Indexe chaque groupe de case
    opensearch_stats = {}
    try:
        client = get_opensearch_client(settings)
        for case_id, events in events_by_case.items():
            # Récupère le case pour le nom optionnel
            case = db.execute(
                select(Case).where(Case.case_id == case_id)
            ).scalar_one_or_none()

            case_name = case.note if case else None

            # Indexe dans OpenSearch
            stats = index_events_batch(
                client=client,
                events=events,
                case_id=case_id,
                case_name=case_name
            )
            opensearch_stats[case_id] = stats
            logger.info(f"Indexed {stats['indexed']} events to OpenSearch for case {case_id}")
    except Exception as e:
        logger.error(f"OpenSearch indexation failed (events saved to DB): {e}")
        # On ne fait pas échouer la requête si l'indexation OS échoue
        # Les événements sont déjà dans PostgreSQL
        opensearch_stats = {"error": str(e)}

    return {
        "ok": True,
        "ingested": len(new_objs),
        "opensearch": opensearch_stats
    }
