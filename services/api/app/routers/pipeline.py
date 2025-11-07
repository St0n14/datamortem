from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, desc
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from ..db import SessionLocal
from ..models import AnalysisModule, TaskRun, Evidence
from ..celery_app import celery_app

# Tasks concrètes
from ..tasks.parse_mft import parse_mft_task
from ..tasks.sample_long_task import sample_long_task
from ..tasks.generate_test_events import generate_test_events
from ..tasks.parse_dissect import parse_with_dissect
from ..tasks.dissect_mft import dissect_extract_mft
# À terme tu ajouteras ici d'autres tasks:
# from ..tasks.parse_registry import parse_registry_task
# from ..tasks.extract_modules import extract_modules_task
# etc.

router = APIRouter()

# registre statique tool -> callable Celery
TASK_REGISTRY = {
    "parse_mft": parse_mft_task,
    "sample_long_task": sample_long_task,
    "generate_test_events": generate_test_events,
    "parse_dissect": parse_with_dissect,
    "dissect_mft": dissect_extract_mft,
    # "parse_registry": parse_registry_task,
    # "extract_modules": extract_modules_task,
}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------- Pydantic schemas ----------

class PipelineModuleOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    tool: Optional[str]
    enabled: bool

    last_run_status: Optional[str] = None
    last_run_started_at_utc: Optional[datetime] = None
    last_run_ended_at_utc: Optional[datetime] = None
    last_run_output_path: Optional[str] = None
    last_run_error_message: Optional[str] = None


class RunRequest(BaseModel):
    module_id: int
    evidence_uid: str


class TaskRunOut(BaseModel):
    id: int
    task_name: str
    evidence_uid: str
    status: str
    started_at_utc: datetime | None
    ended_at_utc: datetime | None
    output_path: str | None
    error_message: str | None
    module_id: int | None


class TaskRunStatusUpdate(BaseModel):
    status: str  # "queued", "running", "success", "error"
    output_path: str | None = None
    error_message: str | None = None


# ---------- Helpers internes ----------

def serialize_task_run(r: TaskRun) -> TaskRunOut:
    return TaskRunOut(
        id=r.id,
        task_name=r.task_name,
        evidence_uid=r.evidence_uid,
        status=r.status,
        started_at_utc=r.started_at_utc,
        ended_at_utc=r.ended_at_utc,
        output_path=r.output_path,
        error_message=r.error_message,
        module_id=r.module_id,
    )


# ---------- Routes ----------

@router.get("/pipeline", response_model=List[PipelineModuleOut])
def get_pipeline(
    evidence_uid: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Retourne les modules d'analyse (AnalysisModule) et
    leur dernier run connu (TaskRun), filtré éventuellement
    sur une evidence.
    """

    modules = db.execute(select(AnalysisModule)).scalars().all()
    out: List[PipelineModuleOut] = []

    for m in modules:
        run_query = select(TaskRun).where(TaskRun.module_id == m.id)
        if evidence_uid:
            run_query = run_query.where(TaskRun.evidence_uid == evidence_uid)
        run_query = run_query.order_by(desc(TaskRun.id)).limit(1)

        last_run = db.execute(run_query).scalar_one_or_none()

        out.append(
            PipelineModuleOut(
                id=m.id,
                name=m.name,
                description=m.description,
                tool=m.tool,
                enabled=bool(m.enabled),

                last_run_status=last_run.status if last_run else None,
                last_run_started_at_utc=last_run.started_at_utc if last_run else None,
                last_run_ended_at_utc=last_run.ended_at_utc if last_run else None,
                last_run_output_path=last_run.output_path if last_run else None,
                last_run_error_message=last_run.error_message if last_run else None,
            )
        )

    return out

@router.get("/pipeline/runs", response_model=List[TaskRunOut])
def list_task_runs(
    evidence_uid: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Liste les TaskRuns récents, optionnellement filtrés par evidence_uid.
    Tri: plus récents d'abord.
    """
    run_q = select(TaskRun).order_by(desc(TaskRun.id))
    if evidence_uid:
        run_q = run_q.where(TaskRun.evidence_uid == evidence_uid)

    runs = db.execute(run_q).scalars().all()
    return [serialize_task_run(r) for r in runs]


@router.post("/pipeline/run")
def run_pipeline_module(payload: RunRequest, db: Session = Depends(get_db)):
    """
    Lance UN module sur une evidence.
    Le module DOIT exister en DB (analysis_modules) et être enabled.
    """

    evidence_uid = payload.evidence_uid
    module_id = payload.module_id

    # 1. Check evidence
    ev = db.query(Evidence).filter_by(evidence_uid=evidence_uid).one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="evidence not found")

    # 2. Check module DB
    mod = db.query(AnalysisModule).filter_by(id=module_id).one_or_none()
    if not mod:
        raise HTTPException(status_code=404, detail="module not found")
    if not mod.enabled:
        raise HTTPException(status_code=400, detail="module disabled")

    tool_name = mod.tool  # ex "parse_mft"
    task_func = TASK_REGISTRY.get(tool_name)
    if task_func is None:
        # module déclaré en DB mais pas implémenté côté code
        raise HTTPException(
            status_code=500,
            detail=f"tool '{tool_name}' not implemented in TASK_REGISTRY"
        )

    # 3. Create TaskRun entry
    tr = TaskRun(
        task_name=tool_name,
        evidence_uid=evidence_uid,
        status="queued",
        started_at_utc=None,
        ended_at_utc=None,
        output_path=None,
        error_message=None,
        module_id=mod.id,
        progress_message="queued",
    )
    db.add(tr)
    db.commit()
    db.refresh(tr)

    # 4. Try to execute task_func (Celery eager en dev)
    try:
        async_result = task_func.delay(evidence_uid, tr.id)
        tr.celery_task_id = getattr(async_result, "id", None)
        db.commit()
    except Exception as e:
        # Le lancement a planté => on log l'échec dans le run, sans planter l'API
        tr.status = "error"
        tr.ended_at_utc = datetime.utcnow()
        tr.error_message = f"launch failed: {e}"
        tr.progress_message = "failed to start"
        db.commit()

    # 5. refresh final (en mode eager la task a pu déjà tout finir)
    db.refresh(tr)

    return {
        "task_run_id": tr.id,
        "status": tr.status,
        "started_at_utc": tr.started_at_utc,
        "ended_at_utc": tr.ended_at_utc,
        "output_path": tr.output_path,
        "error_message": tr.error_message,
        "progress_message": tr.progress_message,
    }
@router.post("/pipeline/run/all")
def run_all_pipeline(evidence_uid: str, db: Session = Depends(get_db)):
    """
    Optionnel : lance TOUS les modules enabled pour une evidence donnée.
    Renvoie la liste des TaskRuns créés.
    """

    ev = db.query(Evidence).filter_by(evidence_uid=evidence_uid).one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="evidence not found")

    mods = (
        db.query(AnalysisModule)
        .filter_by(enabled=True)
        .all()
    )

    created_runs = []

    for mod in mods:
        tr = TaskRun(
            task_name=mod.tool or mod.name,
            evidence_uid=evidence_uid,
            status="queued",
            started_at_utc=None,
            ended_at_utc=None,
            output_path=None,
            error_message=None,
            module_id=mod.id,
            progress_message="queued",
        )
        db.add(tr)
        db.commit()
        db.refresh(tr)

        task_func = TASK_REGISTRY.get(mod.tool)
        if task_func is None:
            # tool inconnu -> on finalise en erreur tout de suite
            tr.status = "error"
            tr.ended_at_utc = datetime.utcnow()
            tr.error_message = f"Unknown tool '{mod.tool}'"
            tr.progress_message = "failed to start"
            db.commit()
            db.refresh(tr)
            created_runs.append(tr)
            continue

        try:
            async_result = task_func.delay(evidence_uid, tr.id)
            tr.celery_task_id = getattr(async_result, "id", None)
            db.commit()
        except Exception as e:
            tr.status = "error"
            tr.ended_at_utc = datetime.utcnow()
            tr.error_message = f"launch failed: {e}"
            tr.progress_message = "failed to start"
            db.commit()

        db.refresh(tr)
        created_runs.append(tr)

    return [
        {
            "task_run_id": r.id,
            "status": r.status,
            "started_at_utc": r.started_at_utc,
            "ended_at_utc": r.ended_at_utc,
            "output_path": r.output_path,
            "error_message": r.error_message,
            "progress_message": r.progress_message,
        }
        for r in created_runs
    ]


@router.post("/pipeline/run/{task_run_id}/kill")
def kill_run(task_run_id: int, db: Session = Depends(get_db)):
    """
    Demande l'arrêt d'un run en cours (queued/running).
    NOTE: avec Celery en mode eager (dev), ça ne tue rien en vrai,
    mais on prépare déjà l'API pour plus tard.
    """

    run = db.query(TaskRun).filter_by(id=task_run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="run not found")

    if run.status not in ("queued", "running"):
        raise HTTPException(status_code=400, detail="cannot kill this run")

    if not run.celery_task_id:
        # en mode eager, on n'a pas vraiment d'ID exploitable
        run.progress_message = "kill requested (no worker id)"
        db.commit()
        return {"ok": True, "note": "no celery_task_id recorded (dev/eager mode)"}

    # revoke côté Celery (en prod)
    celery_app.control.revoke(run.celery_task_id, terminate=False)
    run.progress_message = "kill requested"
    db.commit()

    return {"ok": True}


@router.patch("/pipeline/run/{task_run_id}/status")
def update_task_run_status(
    task_run_id: int,
    body: TaskRunStatusUpdate,
    db: Session = Depends(get_db),
):
    """
    Endpoint technique pour mettre à jour manuellement le statut d'un run
    (utile si on branche un worker externe plus tard ou pour debug).
    """

    run_obj = db.execute(
        select(TaskRun).where(TaskRun.id == task_run_id)
    ).scalar_one_or_none()

    if not run_obj:
        raise HTTPException(status_code=404, detail="task_run not found")

    now = datetime.utcnow()

    run_obj.status = body.status

    # start time si passe en running
    if body.status == "running" and run_obj.started_at_utc is None:
        run_obj.started_at_utc = now

    # end time si success/error
    if body.status in ("success", "error"):
        run_obj.ended_at_utc = now

    # sortie / erreur si fournie
    if body.output_path is not None:
        run_obj.output_path = body.output_path
    if body.error_message is not None:
        run_obj.error_message = body.error_message

    db.commit()
    db.refresh(run_obj)

    return {
        "ok": True,
        "task_run_id": run_obj.id,
        "status": run_obj.status,
        "started_at_utc": run_obj.started_at_utc,
        "ended_at_utc": run_obj.ended_at_utc,
        "output_path": run_obj.output_path,
        "error_message": run_obj.error_message,
    }
