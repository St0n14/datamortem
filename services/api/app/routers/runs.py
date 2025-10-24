from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from datetime import datetime

from ..db import get_db
from ..models import Evidence, AnalysisModule, TaskRun
from ..tasks.dispatch import dispatch_module_task

router = APIRouter()

@router.post("/start")
def start_run(
    evidence_uid: str,
    module_name: str,
    db: Session = Depends(get_db),
):
    # evidence
    ev = db.execute(
        select(Evidence).where(Evidence.evidence_uid == evidence_uid)
    ).scalars().first()
    if not ev:
        raise HTTPException(status_code=404, detail="Evidence not found")

    # module
    mod = db.execute(
        select(AnalysisModule).where(AnalysisModule.name == module_name)
    ).scalars().first()
    if not mod or not mod.enabled:
        raise HTTPException(status_code=404, detail="Module not available/enabled")

    # create TaskRun row
    run = TaskRun(
        evidence_id_fk=ev.id,
        module_id_fk=mod.id,
        status="pending",
        started_at_utc=None,
        ended_at_utc=None,
        error_message="",
        output_path="",
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # dispatch Celery task
    dispatch_module_task(module_name, ev.evidence_uid, run.id)

    return {
        "status": "queued",
        "task_run_id": run.id,
        "evidence_uid": ev.evidence_uid,
        "module_name": mod.name,
    }

@router.get("/history/{evidence_uid}")
def get_runs_for_evidence(
    evidence_uid: str,
    db: Session = Depends(get_db),
):
    ev = db.execute(
        select(Evidence).where(Evidence.evidence_uid == evidence_uid)
    ).scalars().first()
    if not ev:
        raise HTTPException(status_code=404, detail="Evidence not found")

    q = (
        db.query(TaskRun, AnalysisModule)
        .join(AnalysisModule, TaskRun.module_id_fk == AnalysisModule.id)
        .filter(TaskRun.evidence_id_fk == ev.id)
        .order_by(TaskRun.id.desc())
    )

    results = []
    for run, mod in q.all():
        results.append({
            "task_run_id": run.id,
            "module_name": mod.name,
            "status": run.status,
            "started_at_utc": run.started_at_utc.isoformat() + "Z"
                if run.started_at_utc else None,
            "ended_at_utc": run.ended_at_utc.isoformat() + "Z"
                if run.ended_at_utc else None,
            "error_message": run.error_message,
            "output_path": run.output_path,
        })

    return results
