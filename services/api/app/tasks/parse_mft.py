from datetime import datetime
import os
from ..celery_app import celery_app
from ..db import SessionLocal
from ..models import TaskRun, Evidence

@celery_app.task(name="parse_mft_task", bind=True)
def parse_mft_task(self, evidence_uid: str, task_run_id: int):
    """
    Extrait la $MFT et écrit un CSV via dissect.target.
    La task NE DOIT PAS casser le process FastAPI.
    """
    db = SessionLocal()
    try:
        run = db.query(TaskRun).filter_by(id=task_run_id).one()
        ev = db.query(Evidence).filter_by(evidence_uid=evidence_uid).one()
    except Exception:
        db.close()
        return

    run.status = "running"
    run.started_at_utc = datetime.utcnow()
    run.progress_message = "starting parse_mft"
    db.commit()

    try:
        # Import et parsing Dissect
        try:
            from dissect.target import Target
        except Exception as import_err:
            run.status = "error"
            run.error_message = f"dissect not available: {import_err}"
            db.commit()
            db.close()
            return

        disk_path = ev.local_path
        case_id = ev.case.case_id

        out_dir = f"/lake/{case_id}/mft/{evidence_uid}"
        os.makedirs(out_dir, exist_ok=True)
        output_path = os.path.join(out_dir, "mft.csv")

        # Parsing MFT avec dissect.target
        with Target.open(disk_path) as target:
            with open(output_path, "w", encoding="utf-8") as out:
                out.write("record_number,filename,full_path,si_create,si_mtime,si_atime,si_ctime\n")
                for fs in target.fs:
                    try:
                        if hasattr(fs, "mft"):
                            for entry in fs.mft.records():
                                try:
                                    out.write(
                                        f'{entry.record_number},{entry.filename},{entry.full_path or ""},'
                                        f'{entry.si_create},{entry.si_mtime},{entry.si_atime},{entry.si_ctime}\n'
                                    )
                                except Exception:
                                    continue
                    except FileNotFoundError:
                        continue

        run.status = "success"
        run.ended_at_utc = datetime.utcnow()
        run.output_path = output_path
        run.progress_message = "done, launching auto-indexation"
        db.commit()

        # Auto-indexation dans OpenSearch
        from ..tasks.index_results import index_results_task
        parser_name = "parse_mft"

        index_results_task.delay(
            task_run_id=task_run_id,
            file_path=output_path,
            parser_name=parser_name
        )

    except Exception as e:
        run.status = "error"
        run.ended_at_utc = datetime.utcnow()
        run.error_message = str(e)
        run.progress_message = "failed"
        db.commit()
    finally:
        db.close()
