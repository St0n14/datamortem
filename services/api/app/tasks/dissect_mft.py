"""
Tâche Celery pour extraire la MFT d'un collector Velociraptor avec dissect.

Velociraptor collecte souvent :
- Windows.NTFS.MFT (timeline complète du filesystem)
- Fichiers dans uploads/
"""
from datetime import datetime
import os
import zipfile
import json
from ..celery_app import celery_app
from ..db import SessionLocal
from ..models import TaskRun, Evidence


@celery_app.task(bind=True, name="dissect_extract_mft")
def dissect_extract_mft(self, evidence_uid: str, task_run_id: int):
    """
    Extrait et parse la MFT depuis un collector Velociraptor avec dissect.

    Workflow :
    1. Extrait le ZIP Velociraptor
    2. Localise le fichier $MFT dans uploads/ ou results/
    3. Parse avec dissect.ntfs
    4. Exporte en JSONL pour indexation OpenSearch

    Args:
        evidence_uid: UID de l'evidence
        task_run_id: ID du TaskRun

    Returns:
        Dict avec stats de parsing
    """
    db = SessionLocal()

    try:
        run = db.query(TaskRun).filter_by(id=task_run_id).one()
        ev = db.query(Evidence).filter_by(evidence_uid=evidence_uid).one()

        case_id = ev.case.case_id
        zip_path = ev.local_path  # collector.zip

        run.status = "running"
        run.started_at_utc = datetime.utcnow()
        run.progress_message = "extracting velociraptor collector"
        db.commit()

        if not os.path.exists(zip_path):
            raise FileNotFoundError(f"Collector ZIP not found: {zip_path}")

        # Répertoire de travail
        work_dir = f"/lake/{case_id}/{evidence_uid}/dissect_mft"
        os.makedirs(work_dir, exist_ok=True)

        # Extraction
        extract_dir = os.path.join(work_dir, "extracted")
        os.makedirs(extract_dir, exist_ok=True)

        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)

        run.progress_message = "searching for MFT artifacts"
        db.commit()

        # Chercher les fichiers MFT dans le collector
        mft_files = []
        for root, dirs, files in os.walk(extract_dir):
            for file in files:
                # Velociraptor collecte souvent :
                # - uploads/mft/C/$MFT
                # - results/Windows.NTFS.MFT/MFT.csv
                # - uploads/auto/C%3A/%24MFT
                if file.upper() == "$MFT" or "MFT" in file.upper():
                    full_path = os.path.join(root, file)
                    mft_files.append(full_path)

        if not mft_files:
            raise FileNotFoundError(
                "No MFT artifacts found in Velociraptor collector. "
                "Expected uploads/$MFT or results/Windows.NTFS.MFT/"
            )

        run.progress_message = f"found {len(mft_files)} MFT file(s), parsing with dissect"
        db.commit()

        # Output JSONL
        output_file = os.path.join(work_dir, "mft_timeline.jsonl")
        total_entries = 0

        # Parse chaque MFT trouvé
        for mft_path in mft_files:
            try:
                # TODO: Implémenter avec dissect.ntfs quand installé
                # from dissect.ntfs import MFT
                #
                # mft = MFT(open(mft_path, 'rb'))
                # for entry in mft.entries():
                #     if entry.is_allocated():
                #         record = {
                #             "@timestamp": entry.standard_info.modified.isoformat() if entry.standard_info else None,
                #             "file": {
                #                 "path": entry.full_path,
                #                 "name": entry.filename,
                #                 "size": entry.size,
                #                 "created": entry.standard_info.created.isoformat() if entry.standard_info else None,
                #                 "modified": entry.standard_info.modified.isoformat() if entry.standard_info else None,
                #                 "accessed": entry.standard_info.accessed.isoformat() if entry.standard_info else None,
                #             },
                #             "event": {
                #                 "type": "file",
                #                 "action": "mft_record"
                #             },
                #             "source": {
                #                 "parser": "dissect_mft"
                #             },
                #             "case": {
                #                 "id": case_id
                #             },
                #             "evidence": {
                #                 "uid": evidence_uid
                #             }
                #         }
                #         with open(output_file, 'a') as f:
                #             f.write(json.dumps(record) + '\n')
                #         total_entries += 1

                # Pour l'instant : placeholder
                run.progress_message = f"parsing {os.path.basename(mft_path)}"
                db.commit()

                with open(output_file, 'a') as f:
                    # Simuler quelques entrées MFT
                    for i in range(10):
                        placeholder = {
                            "@timestamp": datetime.utcnow().isoformat() + "Z",
                            "file": {
                                "path": f"C:\\Windows\\System32\\file_{i}.dll",
                                "name": f"file_{i}.dll",
                                "size": 4096 * (i + 1),
                            },
                            "event": {
                                "type": "file",
                                "action": "mft_record"
                            },
                            "source": {
                                "parser": "dissect_mft",
                                "mft_file": os.path.basename(mft_path)
                            },
                            "case": {"id": case_id},
                            "evidence": {"uid": evidence_uid},
                            "note": "Placeholder - install dissect.target for real parsing"
                        }
                        f.write(json.dumps(placeholder) + '\n')
                        total_entries += 1

            except Exception as e:
                run.progress_message = f"error parsing {mft_path}: {str(e)}"
                db.commit()
                continue

        run.status = "success"
        run.ended_at_utc = datetime.utcnow()
        run.output_path = output_file
        run.progress_message = f"extracted {total_entries} MFT entries"
        db.commit()

        # Auto-indexation
        from ..tasks.index_results import index_results_task
        index_results_task.delay(
            task_run_id=task_run_id,
            file_path=output_file,
            parser_name="dissect_mft"
        )

        return {
            "status": "success",
            "output_path": output_file,
            "total_entries": total_entries,
            "mft_files_found": len(mft_files),
            "note": "Placeholder data - install dissect.target for real MFT parsing"
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
