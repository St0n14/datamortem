from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from datetime import datetime

from ..db import SessionLocal
from ..models import Evidence, Case

router = APIRouter()

# ------------------------
# DB session dependency
# ------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ------------------------
# Schemas I/O
# ------------------------

class EvidenceIn(BaseModel):
    evidence_uid: str          # ex: "WKST-FA-22_DISK"
    case_id: str               # ex: "INC-2025-TEST-lateral"
    local_path: Optional[str] = None  # ex: "/mnt/disk_images/WKST-FA-22.dd"

    # NOTE :
    # Pas de hostname, pas de type
    # parce que ton modèle SQLAlchemy ne les a pas.


class EvidenceOut(BaseModel):
    id: int
    evidence_uid: str
    case_id: str
    local_path: Optional[str]
    added_at_utc: datetime

    class Config:
        from_attributes = True


# ------------------------
# Routes
# ------------------------

@router.get("/evidences", response_model=List[EvidenceOut])
def list_evidences(
    case_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Retourne toutes les evidences, ou seulement celles liées à un case_id donné.
    """
    q = db.query(Evidence)
    if case_id:
        q = q.filter(Evidence.case_id == case_id)
    rows = q.all()
    return rows


@router.post("/evidences", response_model=EvidenceOut, status_code=201)
def create_evidence(
    payload: EvidenceIn,
    db: Session = Depends(get_db),
):
    """
    Déclare une nouvelle evidence dans une investigation.
    """

    # 1. Vérifier que la case existe
    parent_case = (
        db.query(Case)
        .filter_by(case_id=payload.case_id)
        .first()
    )
    if not parent_case:
        raise HTTPException(
            status_code=400,
            detail="case_id does not exist"
        )

    # 2. Vérifier que evidence_uid n'est pas déjà pris
    existing = (
        db.query(Evidence)
        .filter_by(evidence_uid=payload.evidence_uid)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="evidence_uid already exists"
        )

    # 3. Créer l'Evidence
    ev = Evidence(
        evidence_uid=payload.evidence_uid,
        case_id=payload.case_id,
        local_path=payload.local_path,
        # added_at_utc va se remplir via default=datetime.utcnow dans le modèle
    )

    db.add(ev)
    db.commit()
    db.refresh(ev)

    return ev
