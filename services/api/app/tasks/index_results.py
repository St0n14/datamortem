"""
Celery task for indexing parser results into OpenSearch.
"""

from datetime import datetime
from ..celery_app import celery_app
from ..db import SessionLocal
from ..models import TaskRun, Evidence, Case
from ..opensearch.client import get_opensearch_client
from ..opensearch.indexer import index_parquet_results, index_csv_results, index_jsonl_results
from ..config import settings
import logging
import os

logger = logging.getLogger(__name__)


@celery_app.task(name="index_results_task", bind=True)
def index_results_task(
    self,
    task_run_id: int,
    file_path: str,
    parser_name: str
):
    """
    Indexe les résultats d'un parser dans OpenSearch.

    Supporte les formats Parquet et CSV.

    Args:
        task_run_id: ID du TaskRun source
        file_path: Chemin vers le fichier (Parquet ou CSV)
        parser_name: Nom du parser (source.parser)

    Returns:
        Dict with indexation stats
    """
    db = SessionLocal()

    try:
        # Récupère le TaskRun et Evidence
        run = db.query(TaskRun).filter_by(id=task_run_id).one_or_none()
        if not run:
            logger.error(f"TaskRun {task_run_id} not found")
            return {"status": "error", "error": "TaskRun not found"}

        evidence = run.evidence
        if not evidence:
            logger.error(f"Evidence not found for TaskRun {task_run_id}")
            return {"status": "error", "error": "Evidence not found"}

        case = evidence.case
        if not case:
            logger.error(f"Case not found for Evidence {evidence.evidence_uid}")
            return {"status": "error", "error": "Case not found"}

        case_id = case.case_id
        evidence_uid = evidence.evidence_uid
        case_name = getattr(case, 'name', None)

        logger.info(
            f"Starting indexation for case={case_id}, "
            f"evidence={evidence_uid}, parser={parser_name}"
        )

        # Vérifie que le fichier existe
        if not os.path.exists(file_path):
            error_msg = f"File not found: {file_path}"
            logger.error(error_msg)
            return {"status": "error", "error": error_msg}

        # Détermine le format du fichier
        file_ext = os.path.splitext(file_path)[1].lower()

        # Client OpenSearch
        client = get_opensearch_client(settings)

        # Indexe selon le format
        if file_ext == ".parquet":
            stats = index_parquet_results(
                client=client,
                case_id=case_id,
                evidence_uid=evidence_uid,
                parser_name=parser_name,
                parquet_path=file_path,
                batch_size=settings.dm_opensearch_batch_size,
                case_name=case_name
            )
        elif file_ext == ".csv":
            stats = index_csv_results(
                client=client,
                case_id=case_id,
                evidence_uid=evidence_uid,
                parser_name=parser_name,
                csv_path=file_path,
                batch_size=settings.dm_opensearch_batch_size,
                case_name=case_name
            )
        elif file_ext == ".jsonl":
            stats = index_jsonl_results(
                client=client,
                case_id=case_id,
                evidence_uid=evidence_uid,
                parser_name=parser_name,
                jsonl_path=file_path,
                batch_size=settings.dm_opensearch_batch_size,
                case_name=case_name
            )
        else:
            error_msg = f"Unsupported file format: {file_ext}"
            logger.error(error_msg)
            return {"status": "error", "error": error_msg}

        logger.info(f"Indexation complete: {stats}")

        return {
            "status": "success",
            "stats": stats,
            "case_id": case_id,
            "evidence_uid": evidence_uid,
            "parser_name": parser_name
        }

    except Exception as e:
        logger.error(f"Indexation failed: {e}", exc_info=True)
        return {
            "status": "error",
            "error": str(e)
        }
    finally:
        db.close()


@celery_app.task(name="bulk_index_case_results", bind=True)
def bulk_index_case_results(
    self,
    case_id: str
):
    """
    Indexe tous les résultats non-indexés d'un case.

    Utile pour réindexation ou initialisation.

    Args:
        case_id: Case identifier

    Returns:
        Dict with bulk indexation stats
    """
    db = SessionLocal()

    try:
        # Récupère tous les TaskRun success pour ce case
        case = db.query(Case).filter_by(case_id=case_id).one_or_none()
        if not case:
            logger.error(f"Case {case_id} not found")
            return {"status": "error", "error": "Case not found"}

        task_runs = (
            db.query(TaskRun)
            .join(Evidence)
            .filter(Evidence.case_id == case_id)
            .filter(TaskRun.status == "success")
            .filter(TaskRun.output_path.isnot(None))
            .all()
        )

        logger.info(f"Found {len(task_runs)} TaskRuns to index for case {case_id}")

        results = []
        total_indexed = 0
        total_failed = 0

        for run in task_runs:
            if not run.module:
                logger.warning(f"TaskRun {run.id} has no module, skipping")
                continue

            parser_name = run.module.tool or run.task_name

            result = index_results_task(
                task_run_id=run.id,
                file_path=run.output_path,
                parser_name=parser_name
            )

            results.append({
                "task_run_id": run.id,
                "parser": parser_name,
                "result": result
            })

            if result.get("status") == "success":
                stats = result.get("stats", {})
                total_indexed += stats.get("indexed", 0)
                total_failed += stats.get("failed", 0)

        logger.info(
            f"Bulk indexation complete: {total_indexed} indexed, "
            f"{total_failed} failed across {len(task_runs)} parsers"
        )

        return {
            "status": "success",
            "case_id": case_id,
            "total_indexed": total_indexed,
            "total_failed": total_failed,
            "parser_count": len(task_runs),
            "details": results
        }

    except Exception as e:
        logger.error(f"Bulk indexation failed: {e}", exc_info=True)
        return {
            "status": "error",
            "error": str(e)
        }
    finally:
        db.close()
