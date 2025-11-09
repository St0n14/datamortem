"""
Celery task to execute a stored custom script against an evidence.
"""
import io
import os
from contextlib import redirect_stdout
from datetime import datetime

from ..celery_app import celery_app
from ..config import settings
from ..db import SessionLocal
from ..models import CustomScript, Evidence, TaskRun


@celery_app.task(bind=True, name="run_custom_script")
def run_custom_script(self, script_id: int, evidence_uid: str, task_run_id: int):
    db = SessionLocal()
    try:
        run: TaskRun | None = db.query(TaskRun).filter_by(id=task_run_id).one_or_none()
        script: CustomScript | None = db.query(CustomScript).filter_by(id=script_id).one_or_none()
        evidence: Evidence | None = db.query(Evidence).filter_by(evidence_uid=evidence_uid).one_or_none()

        if not run or not script or not evidence:
            if run:
                run.status = "error"
                run.error_message = "Script or evidence not found"
                run.ended_at_utc = datetime.utcnow()
                db.commit()
            return

        case = evidence.case
        if not case:
            run.status = "error"
            run.error_message = "Case not found for evidence"
            run.ended_at_utc = datetime.utcnow()
            db.commit()
            return

        safe_name = script.name.replace("/", "_")
        output_dir = os.path.join(
            settings.dm_lake_root,
            case.case_id,
            evidence_uid,
            "scripts",
            f"{safe_name}_{script.id}",
        )
        os.makedirs(output_dir, exist_ok=True)

        script_path = os.path.join(output_dir, "script.py")
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(script.source_code)

        stdout_buffer = io.StringIO()
        run.status = "running"
        run.started_at_utc = datetime.utcnow()
        run.progress_message = "executing python script"
        db.commit()

        exec_globals = {
            "__name__": "__datamortem_script__",
        }
        exec_locals = {
            "CASE_ID": case.case_id,
            "EVIDENCE_UID": evidence_uid,
            "EVIDENCE_PATH": evidence.local_path,
            "OUTPUT_DIR": output_dir,
        }

        try:
            compiled = compile(script.source_code, script_path, "exec")
            with redirect_stdout(stdout_buffer):
                exec(compiled, exec_globals, exec_locals)

            output_text = stdout_buffer.getvalue()
            output_path = os.path.join(output_dir, "output.txt")
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(output_text)

            run.status = "success"
            run.ended_at_utc = datetime.utcnow()
            run.output_path = output_path
            run.progress_message = "script execution complete"
            db.commit()
        except Exception as script_error:
            run.status = "error"
            run.ended_at_utc = datetime.utcnow()
            run.error_message = str(script_error)
            run.progress_message = "script execution failed"
            db.commit()
            raise
    finally:
        db.close()
