from fastapi import APIRouter, Depends, UploadFile, Form, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
import hashlib
import os
import uuid

from ..db import get_db
from ..models import Evidence, Case

router = APIRouter()

# adapte ce chemin à TA machine
EVIDENCE_MASTER_ROOT = "/home/braguette/dataMortem/storage/evidence-master"

@router.post("/register")
async def register_evidence(
    case_id: str = Form(...),
    file: UploadFile = Form(...),
    db: Session = Depends(get_db),
):
    # 1. Vérifier le case
    case_obj = db.query(Case).filter_by(case_id=case_id).first()
    if not case_obj:
        raise HTTPException(status_code=404, detail="Case not found")

    # 2. Générer ID d'evidence
    evidence_uid = "EV-" + uuid.uuid4().hex[:12].upper()

    # 3. Créer dossier de stockage maître
    ev_dir = os.path.join(EVIDENCE_MASTER_ROOT, evidence_uid)
    os.makedirs(ev_dir, exist_ok=True)

    dest_path = os.path.join(ev_dir, file.filename)

    # 4. Sauvegarder en stream + SHA256
    sha256_hash = hashlib.sha256()
    size_bytes = 0
    with open(dest_path, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            sha256_hash.update(chunk)
            size_bytes += len(chunk)
            out.write(chunk)

    sha256_val = sha256_hash.hexdigest()

    # 5. Insérer Evidence en DB
    ev = Evidence(
        evidence_uid=evidence_uid,
        case_id_fk=case_obj.id,
        original_filename=file.filename,
        size_bytes=size_bytes,
        sha1="TODO",
        sha256=sha256_val,
        local_path=dest_path,  # <-- NOUVEAU: on garde où est le .vmdk
        status="registered",
        created_at_utc=datetime.utcnow(),
    )

    db.add(ev)
    db.commit()
    db.refresh(ev)

    return {
        "evidence_uid": ev.evidence_uid,
        "case_id": case_id,
        "sha256": ev.sha256,
        "size_bytes": ev.size_bytes,
        "status": ev.status,
        "stored_path": ev.local_path,
    }
