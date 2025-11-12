"""
Tâche Celery pour parser des evidences E01 avec dissect.
Dissect supporte de nombreux formats forensiques Windows/Linux/macOS.
"""
from datetime import datetime
import os
from ..celery_app import celery_app
from ..db import SessionLocal
from ..models import TaskRun, Evidence


@celery_app.task(bind=True, name="parse_with_dissect")
def parse_with_dissect(self, evidence_uid: str, task_run_id: int):
    """
    Parse une evidence (format E01) avec dissect.

    Dissect peut extraire :
    - Processus (pslist)
    - Timeline (MFT, $UsnJrnl, browser history)
    - Registry (run keys, ShimCache, UserAssist)
    - Network (connections, DNS cache)
    - Et bien plus...

    Args:
        evidence_uid: UID de l'evidence
        task_run_id: ID du TaskRun

    Returns:
        Dict avec les stats de parsing
    """
    db = SessionLocal()

    try:
        run = db.query(TaskRun).filter_by(id=task_run_id).one()
        ev = db.query(Evidence).filter_by(evidence_uid=evidence_uid).one()

        case_id = ev.case.case_id
        e01_path = ev.local_path  # Chemin vers le fichier E01

        run.status = "running"
        run.started_at_utc = datetime.utcnow()
        run.progress_message = "initializing dissect parser"
        db.commit()

        # Vérifier que le fichier E01 existe
        if not os.path.exists(e01_path):
            raise FileNotFoundError(f"Evidence E01 not found: {e01_path}")

        # Output directory
        output_dir = f"/lake/{case_id}/evidences/{evidence_uid}/dissect_results"
        os.makedirs(output_dir, exist_ok=True)

        run.progress_message = "opening E01 image with dissect.target"
        db.commit()

        # Ouvrir directement le fichier E01 avec dissect.target
        # dissect.target peut ouvrir directement les fichiers E01 sans extraction
        try:
            from dissect.target import Target
        except ImportError as import_err:
            raise RuntimeError(
                "dissect-target is required to parse E01 images"
            ) from import_err

        # Utiliser un context manager pour garantir la libération des ressources
        # Important pour les gros fichiers E01 de plusieurs Go
        with Target.open(e01_path) as target:
            run.progress_message = "running dissect plugins"
            db.commit()

            # TODO: Ici tu intégreras dissect.target
            # Exemple :
            # - target.os.processes()     # Liste des processus
            # - target.os.registry()      # Clés de registre
            # - target.os.filesystem.mft  # $MFT timeline
            # - target.os.browser.history # Historique navigateurs
            # - target.os.network.connections
            # - etc.

            # Pour l'instant, on simule le succès
            output_file = os.path.join(output_dir, "dissect_artifacts.jsonl")

            with open(output_file, "w") as f:
                f.write('{"status": "dissect parsing placeholder"}\n')

        run.status = "success"
        run.ended_at_utc = datetime.utcnow()
        run.output_path = output_file
        run.progress_message = "dissect parsing complete (placeholder)"
        db.commit()

        # Auto-indexation TODO
        # from ..tasks.index_results import index_results_task
        # index_results_task.delay(
        #     task_run_id=task_run_id,
        #     file_path=output_file,
        #     parser_name="dissect"
        # )

        return {
            "status": "success",
            "output_path": output_file,
            "note": "Dissect integration is a placeholder. Add dissect.target library."
        }

    except Exception as e:
        run.status = "error"
        run.ended_at_utc = datetime.utcnow()
        run.error_message = str(e)
        run.progress_message = "failed"
        db.commit()
        raise
    finally:
        db.close()
