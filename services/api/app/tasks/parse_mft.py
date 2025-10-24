from datetime import datetime
import os
from dissect.target import Target
from dissect.mft import MFT

from ..celery_app import celery_app
from ..db import SessionLocal
from ..models import TaskRun, Evidence

@celery_app.task(name="parse_mft_task")
def parse_mft_task(evidence_uid: str, task_run_id: int):
    """
    Parse la $MFT depuis une image disque avec Dissect (Python API)
    et écrit le résultat dans /lake/<case_id>/mft/<evidence_uid>/mft.csv
    """

    db = SessionLocal()
    run = db.query(TaskRun).filter_by(id=task_run_id).one()
    ev = db.query(Evidence).filter_by(evidence_uid=evidence_uid).one()

    disk_path = ev.local_path
    case_id = ev.case.case_id
    out_dir = f"/lake/{case_id}/mft/{evidence_uid}"
    os.makedirs(out_dir, exist_ok=True)
    output_path = os.path.join(out_dir, "mft.csv")

    run.status = "running"
    run.started_at_utc = datetime.utcnow()
    db.commit()

    try:
        # 1️⃣ ouvrir le disque comme target
        with Target.open(disk_path) as target:
            # 2️⃣ trouver la partition principale
            for fs in target.fs:
                try:
                    # 3️⃣ lire le fichier MFT
                    with fs.open("$MFT") as f:
                        mft = MFT(f)
                        # 4️⃣ écrire le CSV brut
                        with open(output_path, "w", encoding="utf-8") as out:
                            out.write("record_number,filename,full_path,si_create,si_mtime,si_atime,si_ctime\n")
                            for entry in mft.entries():
                                try:
                                    fn = entry.filename_information()
                                    out.write(f"{entry.record_number},{fn.filename},{fn.full_path},{entry.si_create},{entry.si_mtime},{entry.si_atime},{entry.si_ctime}\n")
                                except Exception:
                                    continue
                except FileNotFoundError:
                    continue  # pas de MFT dans cette partition, on ignore

        run.status = "success"
        run.ended_at_utc = datetime.utcnow()
        run.output_path = output_path
        db.commit()

    except Exception as e:
        run.status = "error"
        run.ended_at_utc = datetime.utcnow()
        run.error_message = str(e)
        db.commit()
        raise
