from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from datetime import datetime
import os
import re
import shutil

from ..db import SessionLocal
from ..models import Evidence, Case, User
from ..auth.dependencies import get_current_active_user
from ..auth.permissions import (
    ensure_case_access,
    ensure_case_access_by_id,
    ensure_has_write_permissions,
    get_accessible_case_ids,
    is_admin_user,
)

router = APIRouter()

STANDARD_CASE_LIMIT = 1
STANDARD_STORAGE_LIMIT_BYTES = 1 * 1024 * 1024 * 1024  # 1 GiB pour les analystes
ADMIN_STORAGE_LIMIT_BYTES = 1 * 1024 * 1024 * 1024 * 1024  # 1 TiB pour les admins

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
    current_user: User = Depends(get_current_active_user)
):
    """
    Retourne toutes les evidences, ou seulement celles liées à un case_id donné.
    (Requires authentication)
    """
    query = db.query(Evidence)
    if case_id:
        ensure_case_access_by_id(case_id, current_user, db)
        query = query.filter(Evidence.case_id == case_id)
    elif not is_admin_user(current_user):
        accessible_case_ids = get_accessible_case_ids(db, current_user)
        if not accessible_case_ids:
            return []
        query = query.filter(Evidence.case_id.in_(accessible_case_ids))

    return query.all()


@router.post("/evidences", response_model=EvidenceOut, status_code=201)
def create_evidence(
    payload: EvidenceIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Déclare une nouvelle evidence dans une investigation.
    (Requires authentication)
    """
    ensure_has_write_permissions(current_user)

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

    ensure_case_access(parent_case, current_user, db)

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


@router.post("/evidences/upload", response_model=EvidenceOut, status_code=201)
async def upload_evidence(
    file: UploadFile = File(...),
    evidence_uid: str = Form(...),
    case_id: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Upload d'une evidence (format E01 - Expert Witness Disk Image).

    L'image E01 sera conservée tel quel pour parsing ultérieur avec dissect.
    (Requires authentication)
    """
    ensure_has_write_permissions(current_user)

    # 1. Vérifier que la case existe
    parent_case = db.query(Case).filter_by(case_id=case_id).first()
    if not parent_case:
        raise HTTPException(status_code=400, detail="case_id does not exist")

    ensure_case_access(parent_case, current_user, db)

    # 2. Vérifier que evidence_uid n'est pas déjà pris
    existing = db.query(Evidence).filter_by(evidence_uid=evidence_uid).first()
    if existing:
        raise HTTPException(status_code=409, detail="evidence_uid already exists")

    # 3. Vérifier que c'est un fichier E01
    # Accepter .e01, .E01, et les fichiers segmentés (.e02, .e03, etc. jusqu'à .e99)
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    
    # Pattern pour fichiers E01 : .e01 à .e99 (Expert Witness Disk Image)
    e01_pattern = re.compile(r'\.e\d{2}$', re.IGNORECASE)
    if not e01_pattern.search(file.filename):
        raise HTTPException(
            status_code=400, 
            detail="Only E01 files (Expert Witness Disk Image) are accepted. Format: .e01, .E01, or segmented files (.e02, .e03, etc.)"
        )

    # 4. Créer le répertoire de destination
    evidence_dir = os.path.join("/lake", case_id, "evidences", evidence_uid)
    os.makedirs(evidence_dir, exist_ok=True)

    # 5. Sauvegarder le fichier E01
    # Utiliser le nom original du fichier ou evidence.e01 si pas de nom
    original_filename = file.filename or "evidence.e01"
    e01_path = os.path.join(evidence_dir, original_filename)

    try:
        # Écrire le fichier uploadé en streaming pour gérer les gros fichiers (plusieurs Go)
        # Utiliser un buffer de 8MB pour éviter de charger tout le fichier en mémoire
        chunk_size = 8 * 1024 * 1024  # 8MB
        total_size = 0
        
        with open(e01_path, "wb") as buffer:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                buffer.write(chunk)
                total_size += len(chunk)
                
                # Vérifier la limite de stockage après chaque chunk
                # pour éviter d'écrire tout le fichier avant de rejeter
                try:
                    enforce_storage_limit(db, case_id, total_size, current_user)
                except HTTPException:
                    # Nettoyer le fichier partiellement écrit en cas de dépassement
                    buffer.close()
                    if os.path.exists(e01_path):
                        os.remove(e01_path)
                    raise

        # 6. Créer l'Evidence en DB
        ev = Evidence(
            evidence_uid=evidence_uid,
            case_id=case_id,
            local_path=e01_path,  # Pointe vers le fichier E01
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
    except Exception as e:
        # Nettoyer en cas d'erreur
        if os.path.exists(evidence_dir):
            shutil.rmtree(evidence_dir)
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
def get_case_storage_usage(db: Session, case_id: str) -> int:
    total = 0
    paths = db.query(Evidence.local_path).filter(Evidence.case_id == case_id).all()
    for (path,) in paths:
        if path and os.path.exists(path):
            try:
                total += os.path.getsize(path)
            except OSError:
                continue
    return total


def enforce_storage_limit(db: Session, case_id: str, additional_bytes: int, current_user: User):
    current_usage = get_case_storage_usage(db, case_id)
    
    # Déterminer la limite selon le rôle de l'utilisateur
    if is_admin_user(current_user):
        limit_bytes = ADMIN_STORAGE_LIMIT_BYTES
        limit_description = "1 TiB"
    else:
        limit_bytes = STANDARD_STORAGE_LIMIT_BYTES
        limit_description = "1 GiB"
    
    if current_usage + additional_bytes > limit_bytes:
        raise HTTPException(
            status_code=403,
            detail=f"Storage limit exceeded ({limit_description} per case).",
        )
