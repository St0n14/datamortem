"""
Tâche de test : génère des événements forensiques fictifs au format JSONL
pour tester l'ingestion complète dans OpenSearch.
"""
from datetime import datetime, timedelta
import os
import json
import random
from ..celery_app import celery_app
from ..db import SessionLocal
from ..models import TaskRun, Evidence


@celery_app.task(bind=True, name="generate_test_events")
def generate_test_events(self, evidence_uid: str, task_run_id: int):
    """
    Génère 100 événements forensiques fictifs au format JSONL.
    Ces événements simulent des processus Windows, connexions réseau, et accès fichiers.
    """
    db = SessionLocal()
    run = db.query(TaskRun).filter_by(id=task_run_id).one()
    ev = db.query(Evidence).filter_by(evidence_uid=evidence_uid).one()

    case_id = ev.case.case_id
    out_dir = f"/lake/{case_id}/{evidence_uid}/test_events"
    os.makedirs(out_dir, exist_ok=True)
    output_path = os.path.join(out_dir, "events.jsonl")

    run.status = "running"
    run.started_at_utc = datetime.utcnow()
    run.progress_message = "generating test events"
    db.commit()

    try:
        # Données de test
        processes = ["svchost.exe", "chrome.exe", "powershell.exe", "explorer.exe", "cmd.exe"]
        event_types = ["process", "network", "file"]
        actions = ["create", "delete", "modify", "execute"]

        base_time = datetime.utcnow() - timedelta(hours=24)

        with open(output_path, "w", encoding="utf-8") as f:
            for i in range(100):
                # Générer un timestamp incrémental
                timestamp = (base_time + timedelta(minutes=i * 10)).isoformat() + "Z"

                # Choisir un type d'événement
                event_type = random.choice(event_types)

                # Créer l'événement
                event = {
                    "@timestamp": timestamp,
                    "event": {
                        "type": event_type,
                        "action": random.choice(actions),
                        "id": f"evt_{i:04d}"
                    },
                    "process": {
                        "name": random.choice(processes),
                        "pid": random.randint(1000, 9999)
                    },
                    "host": {
                        "hostname": "WKST-TEST-01",
                        "id": evidence_uid
                    },
                    "case": {
                        "id": case_id
                    },
                    "source": {
                        "parser": "generate_test_events",
                        "evidence_uid": evidence_uid
                    }
                }

                # Ajouter des champs spécifiques selon le type
                if event_type == "network":
                    event["destination"] = {
                        "ip": f"192.168.1.{random.randint(1, 254)}",
                        "port": random.choice([80, 443, 8080, 3389])
                    }
                elif event_type == "file":
                    event["file"] = {
                        "path": f"C:\\Users\\test\\file_{i}.txt",
                        "size": random.randint(1024, 1024000)
                    }

                # Écrire au format JSONL (une ligne par événement)
                f.write(json.dumps(event) + "\n")

                # Mettre à jour la progression tous les 20 événements
                if i % 20 == 0:
                    run.progress_message = f"generated {i}/100 events"
                    db.commit()

        run.status = "success"
        run.ended_at_utc = datetime.utcnow()
        run.output_path = output_path
        run.progress_message = "generated 100 test events, launching auto-indexation"
        db.commit()

        # Auto-indexation dans OpenSearch
        from ..tasks.index_results import index_results_task
        parser_name = "generate_test_events"

        index_results_task.delay(
            task_run_id=task_run_id,
            file_path=output_path,
            parser_name=parser_name
        )

        return {
            "status": "success",
            "events_generated": 100,
            "output_path": output_path,
            "auto_indexation": "launched"
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
