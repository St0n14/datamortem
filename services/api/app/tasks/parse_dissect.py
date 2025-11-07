"""
Tâche Celery pour parser des evidences avec dissect.
Dissect supporte de nombreux formats forensiques Windows/Linux/macOS.
"""
from datetime import datetime
import os
import zipfile
from ..celery_app import celery_app
from ..db import SessionLocal
from ..models import TaskRun, Evidence


@celery_app.task(bind=True, name="parse_with_dissect")
def parse_with_dissect(self, evidence_uid: str, task_run_id: int):
    """
    Parse une evidence (ZIP Velociraptor) avec dissect.

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
        zip_path = ev.local_path  # Chemin vers collector.zip

        run.status = "running"
        run.started_at_utc = datetime.utcnow()
        run.progress_message = "initializing dissect parser"
        db.commit()

        # Vérifier que le ZIP existe
        if not os.path.exists(zip_path):
            raise FileNotFoundError(f"Evidence ZIP not found: {zip_path}")

        # Output directory
        output_dir = f"/lake/{case_id}/{evidence_uid}/dissect_results"
        os.makedirs(output_dir, exist_ok=True)

        run.progress_message = "extracting velociraptor collector"
        db.commit()

        # Extraction temporaire pour dissect
        extract_dir = os.path.join(output_dir, "extracted")
        os.makedirs(extract_dir, exist_ok=True)

        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)

        run.progress_message = "running dissect plugins"
        db.commit()

        # TODO: Ici tu intégreras dissect.target
        # Exemple :
        # from dissect.target import Target
        # target = Target.open(extract_dir)
        #
        # Plugins disponibles :
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
