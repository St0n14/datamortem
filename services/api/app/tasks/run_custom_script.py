"""
Celery task to execute a stored custom script against an evidence with an isolated venv.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from datetime import datetime
from typing import Optional

from ..celery_app import celery_app
from ..config import settings
from ..db import SessionLocal
from ..models import CustomScript, Evidence, TaskRun


def _resolve_python_interpreter(requested: Optional[str]) -> str:
    """Resolve the requested python version to an executable path."""
    candidates: list[str] = []
    version = (requested or "").strip()
    if version:
        if version.startswith("python"):
            candidates.append(version)
        else:
            candidates.append(f"python{version}")
            candidates.append(version)
    candidates.append(sys.executable)

    for candidate in candidates:
        path = shutil.which(candidate)
        if path:
            return path
    raise RuntimeError("Unable to locate a Python interpreter for the requested version.")


def _venv_python_path(venv_dir: str) -> str:
    """Return the python executable path inside the created virtualenv."""
    if os.name == "nt":
        return os.path.join(venv_dir, "Scripts", "python.exe")
    return os.path.join(venv_dir, "bin", "python")


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

        run.status = "running"
        run.started_at_utc = datetime.utcnow()
        run.progress_message = "setting up python environment"
        db.commit()

        try:
            base_python = _resolve_python_interpreter(script.python_version)
            venv_dir = os.path.join(output_dir, "venv")
            subprocess.run([base_python, "-m", "venv", venv_dir], check=True)
            venv_python = _venv_python_path(venv_dir)
            subprocess.run([venv_python, "-m", "pip", "install", "--upgrade", "pip"], check=True)

            if script.requirements:
                requirements_file = os.path.join(output_dir, "requirements.txt")
                with open(requirements_file, "w", encoding="utf-8") as req_file:
                    req_file.write(script.requirements.strip() + "\n")
                run.progress_message = "installing dependencies"
                db.commit()
                subprocess.run([venv_python, "-m", "pip", "install", "-r", requirements_file], check=True)

            run.progress_message = "executing script"
            db.commit()

            env = os.environ.copy()
            env.update(
                {
                    "CASE_ID": case.case_id,
                    "EVIDENCE_UID": evidence_uid,
                    "EVIDENCE_PATH": evidence.local_path or "",
                    "OUTPUT_DIR": output_dir,
                }
            )

            result = subprocess.run(
                [venv_python, script_path],
                capture_output=True,
                text=True,
                env=env,
                cwd=output_dir,
                check=True,
            )

            output_path = os.path.join(output_dir, "output.txt")
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(result.stdout or "")
                if result.stderr:
                    f.write("\n--- STDERR ---\n")
                    f.write(result.stderr)

            run.status = "success"
            run.ended_at_utc = datetime.utcnow()
            run.output_path = output_path
            run.progress_message = "script execution complete"
            db.commit()
        except subprocess.CalledProcessError as proc_error:
            run.status = "error"
            run.ended_at_utc = datetime.utcnow()
            run.error_message = proc_error.stderr or str(proc_error)
            run.progress_message = "script execution failed"
            db.commit()
            raise
        except Exception as script_error:
            run.status = "error"
            run.ended_at_utc = datetime.utcnow()
            run.error_message = str(script_error)
            run.progress_message = "script execution failed"
            db.commit()
            raise
    finally:
        db.close()
