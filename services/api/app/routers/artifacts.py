from fastapi import APIRouter, HTTPException, Query
from typing import List
import os

router = APIRouter()

# sécurité basique : on ne laisse lire que sous /lake/
LAKE_ROOT = "/lake"

@router.get("/artifact/preview")
def artifact_preview(
    path: str = Query(..., description="Absolute path to artifact on disk"),
    max_lines: int = 20,
):
    # 1. sécurité : empêcher d'aller lire /etc/passwd etc.
    #    On force que le path commence par LAKE_ROOT
    if not os.path.realpath(path).startswith(os.path.realpath(LAKE_ROOT)):
        raise HTTPException(status_code=403, detail="forbidden path")

    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="artifact not found")

    # 2. on lit les premières lignes du fichier (texte)
    lines: List[str] = []
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f):
                if i >= max_lines:
                    break
                lines.append(line.rstrip("\n"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"read failed: {e}")

    return {
        "path": path,
        "lines": lines,
        "truncated": True
    }
