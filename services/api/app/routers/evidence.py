from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from datetime import datetime
import os
import zipfile
import shutil

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


def validate_velociraptor_zip(zip_path: str) -> bool:
    """
    Valide qu'un ZIP est un collector Velociraptor offline.

    Structure typique Velociraptor :
    - uploads/ (contient les artifacts collectés)
    - results/ (contient les résultats CSV/JSON)
    - Velociraptor.log ou collection.log
    """
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            file_list = zip_ref.namelist()

            # Vérifier présence de dossiers typiques Velociraptor
            has_uploads = any('uploads/' in f for f in file_list)
            has_results = any('results/' in f for f in file_list)
            has_log = any('.log' in f.lower() for f in file_list)

            # Au moins un indicateur doit être présent
            return has_uploads or has_results or has_log
    except zipfile.BadZipFile:
        return False
    except Exception:
        return False


@router.post("/evidences/upload", response_model=EvidenceOut, status_code=201)
async def upload_evidence(
    file: UploadFile = File(...),
    evidence_uid: str = Form(...),
    case_id: str = Form(...),
    db: Session = Depends(get_db),
):
    """
    Upload d'une evidence (ZIP Velociraptor offline collector).

    Le ZIP sera conservé tel quel pour parsing ultérieur avec dissect.
    """

    # 1. Vérifier que la case existe
    parent_case = db.query(Case).filter_by(case_id=case_id).first()
    if not parent_case:
        raise HTTPException(status_code=400, detail="case_id does not exist")

    # 2. Vérifier que evidence_uid n'est pas déjà pris
    existing = db.query(Evidence).filter_by(evidence_uid=evidence_uid).first()
    if existing:
        raise HTTPException(status_code=409, detail="evidence_uid already exists")

    # 3. Vérifier que c'est un ZIP
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Only ZIP files are accepted")

    # 4. Créer le répertoire de destination
    evidence_dir = f"/lake/{case_id}/evidences/{evidence_uid}"
    os.makedirs(evidence_dir, exist_ok=True)

    # 5. Sauvegarder le ZIP
    zip_path = os.path.join(evidence_dir, "collector.zip")

    try:
        # Écrire le fichier uploadé
        with open(zip_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # 6. Valider que c'est un collector Velociraptor
        if not validate_velociraptor_zip(zip_path):
            raise HTTPException(
                status_code=400,
                detail="Invalid Velociraptor collector format. Expected uploads/, results/, or log files."
            )

        # 7. Créer l'Evidence en DB
        ev = Evidence(
            evidence_uid=evidence_uid,
            case_id=case_id,
            local_path=zip_path,  # Pointe vers le ZIP, pas extrait
        )

        db.add(ev)
        db.commit()
        db.refresh(ev)

        return ev

    except HTTPException:
        # Re-raise HTTP exceptions (validation errors)
        if os.path.exists(evidence_dir):
            shutil.rmtree(evidence_dir)
        raise
    except zipfile.BadZipFile:
        # Nettoyer en cas d'erreur
        if os.path.exists(evidence_dir):
            shutil.rmtree(evidence_dir)
        raise HTTPException(status_code=400, detail="Invalid ZIP file")
    except Exception as e:
        # Nettoyer en cas d'erreur
        if os.path.exists(evidence_dir):
            shutil.rmtree(evidence_dir)
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
