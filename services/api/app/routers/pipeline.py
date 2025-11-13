from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, desc, func
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime
import docker

from ..db import SessionLocal
from ..models import AnalysisModule, TaskRun, Evidence, User
from ..auth.dependencies import get_current_active_user, get_current_admin_user
from ..auth.permissions import (
    ensure_evidence_access_by_uid,
    ensure_has_write_permissions,
    ensure_task_run_access,
    get_accessible_case_ids,
    is_admin_user,
)
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

router = APIRouter(tags=["pipeline"])

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
    script_id: int | None
    script_name: str | None = None
    case_id: str | None = None


class TaskRunStatusUpdate(BaseModel):
    status: str  # "queued", "running", "success", "error"
    output_path: str | None = None
    error_message: str | None = None


# ---------- Helpers internes ----------

def _stop_docker_containers_for_task(run: TaskRun):
    """
    Arrête les conteneurs Docker en cours d'exécution pour une tâche donnée.
    Pour run_custom_script, on cherche les conteneurs qui pourraient être liés à cette tâche.
    """
    try:
        client = docker.from_env()
        
        # Chercher les conteneurs en cours d'exécution
        running_containers = client.containers.list(filters={"status": "running"})
        
        # Pour run_custom_script, on peut identifier les conteneurs par leur nom ou labels
        # Les conteneurs créés par run_custom_script n'ont pas de labels spécifiques,
        # donc on va essayer d'arrêter tous les conteneurs qui pourraient être liés
        # En pratique, on pourrait améliorer cela en ajoutant des labels aux conteneurs
        
        # Pour l'instant, on cherche les conteneurs qui contiennent "sandbox" dans leur nom
        # ou qui sont récents (créés dans les dernières minutes)
        stopped_count = 0
        for container in running_containers:
            try:
                # Vérifier si le conteneur est récent (créé dans les 10 dernières minutes)
                # et pourrait être lié à cette tâche
                container_info = container.attrs
                created = container_info.get("Created", "")
                
                # Arrêter les conteneurs sandbox qui pourraient être liés
                image = container_info.get("Config", {}).get("Image", "")
                if "sandbox" in image.lower():
                    container.stop(timeout=5)
                    container.remove()
                    stopped_count += 1
            except Exception as e:
                # Ignorer les erreurs pour un conteneur spécifique
                print(f"Warning: Could not stop container {container.id}: {e}")
                continue
        
        if stopped_count > 0:
            print(f"Stopped {stopped_count} Docker container(s) for task {run.id}")
            
    except docker.errors.DockerException as e:
        print(f"Error connecting to Docker: {e}")
        raise
    except Exception as e:
        print(f"Error stopping Docker containers: {e}")
        raise


def serialize_task_run(r: TaskRun) -> TaskRunOut:
    # Get case_id from evidence relationship
    case_id = None
    if r.evidence:
        case_id = r.evidence.case_id
    
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
        script_id=r.script_id,
        script_name=r.script.name if r.script else None,
        case_id=case_id,
    )


# ---------- Routes ----------

@router.get("/pipeline", response_model=List[PipelineModuleOut])
def get_pipeline(
    evidence_uid: Optional[str] = Query(None, description="Filter by evidence UID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retourne les modules d'analyse (AnalysisModule) et
    leur dernier run connu (TaskRun), filtré éventuellement
    sur une evidence. (Requires authentication)
    
    Optimisé pour éviter les requêtes N+1.
    """
    # Check if pipeline is enabled
    from .feature_flags import is_feature_enabled
    if not is_feature_enabled("pipeline", db):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="La pipeline est actuellement désactivée."
        )

    # Récupérer tous les modules
    modules = db.execute(select(AnalysisModule)).scalars().all()
    accessible_case_ids = None
    if not is_admin_user(current_user):
        accessible_case_ids = get_accessible_case_ids(db, current_user)
        if not accessible_case_ids:
            return []

    if evidence_uid:
        # Ensure the requester can access the evidence before using it
        ensure_evidence_access_by_uid(evidence_uid, current_user, db)

    # Optimisation: récupérer tous les derniers runs en une seule requête
    # Utilisation d'une sous-requête pour obtenir le dernier run par module
    module_ids = [m.id for m in modules]
    if not module_ids:
        return []

    # Construire la sous-requête pour obtenir le max(id) par module_id avec les mêmes filtres
    max_ids_subq = (
        select(
            TaskRun.module_id,
            func.max(TaskRun.id).label("max_id")
        )
        .where(TaskRun.module_id.in_(module_ids))
    )
    
    if evidence_uid:
        max_ids_subq = max_ids_subq.where(TaskRun.evidence_uid == evidence_uid)
    elif accessible_case_ids is not None:
        max_ids_subq = max_ids_subq.join(Evidence, TaskRun.evidence_uid == Evidence.evidence_uid)
        max_ids_subq = max_ids_subq.filter(Evidence.case_id.in_(accessible_case_ids))
    
    max_ids_subq = max_ids_subq.group_by(TaskRun.module_id).subquery()
    
    # Récupérer les TaskRuns correspondants en joignant avec la sous-requête
    last_runs_query = (
        select(TaskRun)
        .join(max_ids_subq, TaskRun.id == max_ids_subq.c.max_id)
    )
    
    # Exécuter et créer un dictionnaire module_id -> TaskRun
    last_runs = db.execute(last_runs_query).scalars().all()
    last_runs_by_module: Dict[int, TaskRun] = {run.module_id: run for run in last_runs if run.module_id}

    # Construire la réponse
    out: List[PipelineModuleOut] = []
    for m in modules:
        last_run = last_runs_by_module.get(m.id)
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
    evidence_uid: Optional[str] = Query(None, description="Filter by evidence UID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Liste les TaskRuns récents, optionnellement filtrés par evidence_uid. (Requires authentication)
    Tri: plus récents d'abord.
    """
    run_q = select(TaskRun).options(joinedload(TaskRun.evidence)).order_by(desc(TaskRun.id))
    if evidence_uid:
        ensure_evidence_access_by_uid(evidence_uid, current_user, db)
        run_q = run_q.where(TaskRun.evidence_uid == evidence_uid)
    elif not is_admin_user(current_user):
        accessible_case_ids = get_accessible_case_ids(db, current_user)
        if not accessible_case_ids:
            return []
        run_q = run_q.join(Evidence, TaskRun.evidence_uid == Evidence.evidence_uid)
        run_q = run_q.filter(Evidence.case_id.in_(accessible_case_ids))

    runs = db.execute(run_q).unique().scalars().all()
    return [serialize_task_run(r) for r in runs]


@router.post("/pipeline/run")
def run_pipeline_module(
    payload: RunRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Lance UN module sur une evidence.
    Le module DOIT exister en DB (analysis_modules) et être enabled.
    """
    # Check if pipeline is enabled
    from .feature_flags import is_feature_enabled
    if not is_feature_enabled("pipeline", db):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="La pipeline est actuellement désactivée."
        )

    ensure_has_write_permissions(current_user)

    evidence_uid = payload.evidence_uid
    module_id = payload.module_id

    # 1. Check evidence
    ev = db.query(Evidence).filter_by(evidence_uid=evidence_uid).one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="evidence not found")
    ensure_evidence_access_by_uid(evidence_uid, current_user, db)

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
def run_all_pipeline(
    evidence_uid: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Optionnel : lance TOUS les modules enabled pour une evidence donnée.
    Renvoie la liste des TaskRuns créés.
    """

    ensure_has_write_permissions(current_user)

    ev = db.query(Evidence).filter_by(evidence_uid=evidence_uid).one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="evidence not found")
    ensure_evidence_access_by_uid(evidence_uid, current_user, db)

    mods = (
        db.query(AnalysisModule)
        .filter_by(enabled=True)
        .all()
    )

    created_runs = []
    runs_to_commit = []

    # Phase 1: Créer tous les TaskRuns en batch
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
        runs_to_commit.append((tr, mod))
    
    # Commit unique pour tous les TaskRuns
    db.commit()
    
    # Phase 2: Lancer les tâches et mettre à jour les TaskRuns
    for tr, mod in runs_to_commit:
        db.refresh(tr)
        
        task_func = TASK_REGISTRY.get(mod.tool)
        if task_func is None:
            # tool inconnu -> on finalise en erreur tout de suite
            tr.status = "error"
            tr.ended_at_utc = datetime.utcnow()
            tr.error_message = f"Unknown tool '{mod.tool}'"
            tr.progress_message = "failed to start"
            created_runs.append(tr)
            continue

        try:
            async_result = task_func.delay(evidence_uid, tr.id)
            tr.celery_task_id = getattr(async_result, "id", None)
        except Exception as e:
            tr.status = "error"
            tr.ended_at_utc = datetime.utcnow()
            tr.error_message = f"launch failed: {e}"
            tr.progress_message = "failed to start"
        
        created_runs.append(tr)
    
    # Commit unique pour toutes les mises à jour
    db.commit()
    
    # Refresh final pour tous les runs
    for tr in created_runs:
        db.refresh(tr)

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
def kill_run(
    task_run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Arrête un run en cours (queued/running).
    - Révoque la tâche Celery avec terminate=True pour forcer l'arrêt
    - Arrête les conteneurs Docker si la tâche en utilise
    - Met à jour le statut du TaskRun à "killed"
    """

    ensure_has_write_permissions(current_user)

    run = db.query(TaskRun).filter_by(id=task_run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="run not found")

    ensure_task_run_access(run, current_user, db)

    if run.status not in ("queued", "running"):
        raise HTTPException(
            status_code=400, 
            detail=f"cannot kill this run: status is '{run.status}' (must be 'queued' or 'running')"
        )

    # Arrêter les conteneurs Docker si la tâche en utilise (ex: run_custom_script)
    if run.task_name == "run_custom_script" and run.status == "running":
        try:
            _stop_docker_containers_for_task(run)
        except Exception as e:
            # Log l'erreur mais continue quand même avec la révocation Celery
            print(f"Warning: Failed to stop Docker containers for task {task_run_id}: {e}")

    # Révoquer la tâche Celery avec terminate=True pour forcer l'arrêt
    if run.celery_task_id:
        try:
            celery_app.control.revoke(run.celery_task_id, terminate=True, signal="SIGKILL")
        except Exception as e:
            print(f"Warning: Failed to revoke Celery task {run.celery_task_id}: {e}")

    # Mettre à jour le statut du TaskRun
    run.status = "killed"
    run.ended_at_utc = datetime.utcnow()
    run.progress_message = "killed by user"
    run.error_message = "Task was killed by user request"
    db.commit()

    return {
        "ok": True,
        "task_run_id": run.id,
        "status": run.status,
        "message": "Task killed successfully"
    }


@router.patch("/pipeline/run/{task_run_id}/status")
def update_task_run_status(
    task_run_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
    """
    Endpoint technique pour mettre à jour manuellement le statut d'un run
    (utile si on branche un worker externe plus tard ou pour debug).
    (Requires authentication)
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
