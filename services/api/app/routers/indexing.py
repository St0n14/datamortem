"""
Indexing router - Endpoints pour déclencher l'indexation OpenSearch.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import TaskRun, Case, Evidence, User
from ..auth.dependencies import get_current_active_user
from ..auth.permissions import (
    ensure_case_access,
    ensure_case_access_by_id,
    ensure_task_run_access,
)
from ..tasks.index_results import index_results_task, bulk_index_case_results
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["indexing"], prefix="/indexing")


# === SCHEMAS ===

class IndexTaskRunRequest(BaseModel):
    """Request pour indexer les résultats d'un TaskRun spécifique."""
    task_run_id: int


class IndexTaskRunResponse(BaseModel):
    """Response après déclenchement de l'indexation."""
    status: str
    message: str
    task_run_id: int
    celery_task_id: Optional[str] = None


class IndexCaseRequest(BaseModel):
    """Request pour indexer tous les résultats d'un case."""
    case_id: str
    force_reindex: bool = False  # Si True, réindexe même si déjà indexé


class IndexCaseResponse(BaseModel):
    """Response après déclenchement de l'indexation d'un case."""
    status: str
    message: str
    case_id: str
    task_runs_count: int
    celery_task_id: Optional[str] = None


class IndexStatusResponse(BaseModel):
    """Status d'une tâche d'indexation."""
    task_run_id: int
    parser_name: str
    status: str  # success, pending, running, error
    indexed_count: Optional[int] = None
    failed_count: Optional[int] = None
    error_message: Optional[str] = None


# === ENDPOINTS ===

@router.post("/task-run", response_model=IndexTaskRunResponse)
def index_task_run(
    req: IndexTaskRunRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Déclenche l'indexation des résultats d'un TaskRun spécifique.

    Utile pour:
    - Indexer manuellement un TaskRun après son exécution
    - Réindexer si l'indexation précédente a échoué
    - Indexer des anciens TaskRuns qui n'ont pas été indexés
    """
    # Récupère le TaskRun
    task_run = db.query(TaskRun).filter_by(id=req.task_run_id).first()

    if not task_run:
        raise HTTPException(
            status_code=404,
            detail=f"TaskRun {req.task_run_id} not found"
        )

    ensure_task_run_access(task_run, current_user)

    # Vérifie que le TaskRun a terminé avec succès
    if task_run.status != "success":
        raise HTTPException(
            status_code=400,
            detail=f"TaskRun {req.task_run_id} status is '{task_run.status}', expected 'success'"
        )

    # Vérifie qu'il y a un output_path
    if not task_run.output_path:
        raise HTTPException(
            status_code=400,
            detail=f"TaskRun {req.task_run_id} has no output_path"
        )

    # Détermine le nom du parser
    parser_name = task_run.module.tool if task_run.module else task_run.task_name

    logger.info(
        f"Triggering indexation for TaskRun {req.task_run_id}, "
        f"parser: {parser_name}, file: {task_run.output_path}"
    )

    # Déclenche la tâche Celery
    try:
        result = index_results_task.delay(
            task_run_id=req.task_run_id,
            file_path=task_run.output_path,
            parser_name=parser_name
        )

        return IndexTaskRunResponse(
            status="triggered",
            message=f"Indexation started for TaskRun {req.task_run_id}",
            task_run_id=req.task_run_id,
            celery_task_id=result.id
        )

    except Exception as e:
        logger.error(f"Failed to trigger indexation: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to trigger indexation: {str(e)}"
        )


@router.post("/case", response_model=IndexCaseResponse)
def index_case(
    req: IndexCaseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Déclenche l'indexation de tous les résultats d'un case.

    Indexe tous les TaskRuns avec status='success' qui ont un output_path.

    Args:
        req.case_id: Case identifier
        req.force_reindex: Si True, réindexe tout (supprime et recrée l'index)
    """
    # Vérifie que le case existe
    case = ensure_case_access_by_id(req.case_id, current_user, db)

    # Compte les TaskRuns à indexer
    task_runs_query = (
        db.query(TaskRun)
        .join(Evidence)
        .filter(Evidence.case_id == req.case_id)
        .filter(TaskRun.status == "success")
        .filter(TaskRun.output_path.isnot(None))
    )

    task_runs_count = task_runs_query.count()

    if task_runs_count == 0:
        return IndexCaseResponse(
            status="no_data",
            message=f"No TaskRuns to index for case {req.case_id}",
            case_id=req.case_id,
            task_runs_count=0
        )

    logger.info(
        f"Triggering bulk indexation for case {req.case_id}, "
        f"{task_runs_count} TaskRuns"
    )

    # Si force_reindex, on pourrait d'abord supprimer l'index
    if req.force_reindex:
        logger.info(f"Force reindex requested for case {req.case_id}")
        # TODO: Ajouter suppression + recréation de l'index ici

    # Déclenche la tâche Celery de bulk indexation
    try:
        result = bulk_index_case_results.delay(case_id=req.case_id)

        return IndexCaseResponse(
            status="triggered",
            message=f"Bulk indexation started for case {req.case_id}",
            case_id=req.case_id,
            task_runs_count=task_runs_count,
            celery_task_id=result.id
        )

    except Exception as e:
        logger.error(f"Failed to trigger bulk indexation: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to trigger bulk indexation: {str(e)}"
        )


@router.get("/status/{task_run_id}", response_model=IndexStatusResponse)
def get_indexing_status(
    task_run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Récupère le statut d'indexation d'un TaskRun.

    Note: Pour l'instant retourne juste les infos du TaskRun.
    À enrichir avec les infos de la tâche Celery si besoin.
    """
    task_run = db.query(TaskRun).filter_by(id=task_run_id).first()

    if not task_run:
        raise HTTPException(
            status_code=404,
            detail=f"TaskRun {task_run_id} not found"
        )

    ensure_task_run_access(task_run, current_user)

    parser_name = task_run.module.tool if task_run.module else task_run.task_name

    return IndexStatusResponse(
        task_run_id=task_run_id,
        parser_name=parser_name,
        status=task_run.status,
        error_message=task_run.error_message
    )


@router.get("/case/{case_id}/summary")
def get_case_indexing_summary(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Récupère un résumé de l'état d'indexation d'un case.

    Retourne:
    - Nombre total de TaskRuns
    - Nombre de TaskRuns indexés
    - Nombre de documents dans l'index OpenSearch
    """
    # Vérifie que le case existe
    case = ensure_case_access_by_id(case_id, current_user, db)

    # Compte les TaskRuns par status
    total_task_runs = (
        db.query(TaskRun)
        .join(Evidence)
        .filter(Evidence.case_id == case_id)
        .count()
    )

    success_task_runs = (
        db.query(TaskRun)
        .join(Evidence)
        .filter(Evidence.case_id == case_id)
        .filter(TaskRun.status == "success")
        .count()
    )

    indexable_task_runs = (
        db.query(TaskRun)
        .join(Evidence)
        .filter(Evidence.case_id == case_id)
        .filter(TaskRun.status == "success")
        .filter(TaskRun.output_path.isnot(None))
        .count()
    )

    # Récupère le nombre de documents dans OpenSearch
    try:
        from ..opensearch.client import get_opensearch_client
        from ..opensearch.index_manager import get_document_count, get_index_name
        from ..config import settings

        client = get_opensearch_client(settings)
        index_name = get_index_name(case_id)

        if client.indices.exists(index=index_name):
            document_count = get_document_count(client, case_id)
        else:
            document_count = 0

    except Exception as e:
        logger.warning(f"Failed to get document count from OpenSearch: {e}")
        document_count = None

    return {
        "case_id": case_id,
        "task_runs": {
            "total": total_task_runs,
            "success": success_task_runs,
            "indexable": indexable_task_runs
        },
        "opensearch": {
            "document_count": document_count,
            "index_name": get_index_name(case_id) if case else None
        }
    }
