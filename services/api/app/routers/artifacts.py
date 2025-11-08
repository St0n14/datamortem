from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List
import os

from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_active_user
from ..auth.permissions import ensure_case_access_by_id
from ..db import get_db
from ..models import User

router = APIRouter()

# sécurité basique : on ne laisse lire que sous /lake/
LAKE_ROOT = "/lake"

@router.get("/artifact/preview")
def artifact_preview(
    path: str = Query(..., description="Absolute path to artifact on disk"),
    max_lines: int = 20,
    case_id: str = Query(..., description="Case identifier associated with the artifact"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    ensure_case_access_by_id(case_id, current_user, db)
    case_root = os.path.realpath(os.path.join(LAKE_ROOT, case_id))
    requested_path = os.path.realpath(path)

    # 1. sécurité : empêcher d'aller lire /etc/passwd etc.
    #    On force que le path commence par le répertoire du case
    if not requested_path.startswith(case_root):
        raise HTTPException(status_code=403, detail="forbidden path")

    if not os.path.exists(requested_path):
        raise HTTPException(status_code=404, detail="artifact not found")

    # 2. on lit les premières lignes du fichier (texte)
    lines: List[str] = []
    try:
        with open(requested_path, "r", encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f):
                if i >= max_lines:
                    break
                lines.append(line.rstrip("\n"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"read failed: {e}")

    return {
        "path": requested_path,
        "lines": lines,
        "truncated": True
    }
