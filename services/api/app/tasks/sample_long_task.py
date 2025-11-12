from datetime import datetime
import os
import time
from ..celery_app import celery_app
from ..db import SessionLocal
from ..models import TaskRun, Evidence

@celery_app.task(bind=True, name="sample_long_task")
def sample_long_task(self, evidence_uid: str, task_run_id: int):
    db = SessionLocal()
    run = db.query(TaskRun).filter_by(id=task_run_id).one()
    ev = db.query(Evidence).filter_by(evidence_uid=evidence_uid).one()

    case_id = ev.case.case_id
    out_dir = f"/tmp/requiem/{case_id}/sample/{evidence_uid}"
    os.makedirs(out_dir, exist_ok=True)
    output_path = os.path.join(out_dir, "sample.txt")

    run.status = "running"
    run.started_at_utc = datetime.utcnow()
    run.progress_message = "initializing"
    db.commit()

    try:
        with open(output_path, "w", encoding="utf-8") as f:
            for i in range(30):
                # check kill - simplified without is_aborted
                # if self.is_aborted():
                #     raise InterruptedError("Task revoked")

                msg = f"[{datetime.utcnow().isoformat()}Z] step {i}/30 doing stuff...\n"
                f.write(msg)
                f.flush()

                run.progress_message = f"step {i}/30"
                db.commit()

                time.sleep(1)

        run.status = "success"
        run.ended_at_utc = datetime.utcnow()
        run.output_path = output_path
        run.progress_message = "done"
        db.commit()

    except InterruptedError as e:
        run.status = "killed"
        run.ended_at_utc = datetime.utcnow()
        run.error_message = str(e)
        run.progress_message = "aborted"
        db.commit()
        return

    except Exception as e:
        run.status = "error"
        run.ended_at_utc = datetime.utcnow()
        run.error_message = str(e)
        run.progress_message = "failed"
        db.commit()
        raise
    finally:
        db.close()

# réutilise la méthode is_aborted qu'on a définie plus tôt :
def _task_is_aborted(self):
    from celery.result import AsyncResult
    res = AsyncResult(self.request.id)
    return res.status in ("REVOKED", "FAILURE")

setattr(sample_long_task, "is_aborted", _task_is_aborted)
