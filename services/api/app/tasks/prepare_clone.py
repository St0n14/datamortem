import os
#from . import utils   # tu créeras un utils.py si besoin
from ..celery_app import celery_app
from ..db import SessionLocal
from ..models import Evidence

@celery_app.task(name="app.tasks.prepare_clone.run")
def prepare_clone(evidence_uid: str):
    """
    1. créer /work/<evidence_uid>/
    2. faire le snapshot/reflink depuis /evidence/master/<evidence_uid> -> /work/<evidence_uid>
    3. mettre status = "mounted" en DB
    4. push extract_modules task
    """

    work_root = f"/work/{evidence_uid}"
    os.makedirs(work_root, exist_ok=True)

    # Ici tu feras ton cp --reflink=always, qemu-nbd mount RO, etc.
    # (placeholder pour le moment)

    db = SessionLocal()
    ev = db.query(Evidence).filter_by(evidence_uid=evidence_uid).one()
    ev.status = "mounted"
    db.commit()

    # à la fin: lancer l'extraction
    from .extract_modules import extract_modules
    extract_modules.delay(evidence_uid=evidence_uid)
