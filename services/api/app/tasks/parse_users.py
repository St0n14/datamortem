from datetime import datetime
import os

from ..celery_app import celery_app
from ..db import SessionLocal
from ..models import TaskRun, Evidence

@celery_app.task(name="parse_users_task")
def parse_users_task(evidence_uid: str, task_run_id: int):
    db = SessionLocal()

    run = db.query(TaskRun).filter_by(id=task_run_id).one()
    ev = db.query(Evidence).filter_by(evidence_uid=evidence_uid).one()

    run.status = "running"
    run.started_at_utc = datetime.utcnow()
    db.commit()

    try:
        out_dir = f"/lake/{ev.case.case_id}/users/{evidence_uid}"
        os.makedirs(out_dir, exist_ok=True)
        output_path = os.path.join(out_dir, "part-000.parquet")

        with open(output_path, "w") as f:
            f.write("users_placeholder\n")

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
