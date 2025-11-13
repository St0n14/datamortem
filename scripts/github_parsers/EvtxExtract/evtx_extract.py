#!/usr/bin/env python3
import json
import os
from pathlib import Path

from dissect.target import Target

MAX_LINES_PER_FILE = 100_000
FLUSH_INTERVAL = 10_000


class ChunkedJSONLWriter:
    """Rotate JSONL files to keep each shard below the line threshold."""

    def __init__(self, output_dir: Path, base_name: str, max_lines: int = MAX_LINES_PER_FILE):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.base_name = base_name
        self.max_lines = max_lines
        self._file_index = 0
        self._line_count = 0
        self._handle = None
        self.files: list[Path] = []

    def _rotate(self):
        if self._handle:
            self._handle.close()
        self._file_index += 1
        self._line_count = 0
        file_path = self.output_dir / f"{self.base_name}_{self._file_index:04d}.jsonl"
        self._handle = open(file_path, "w", encoding="utf-8")
        self.files.append(file_path)
        print(f"[writer] Nouveau fichier créé: {file_path}")

    def write(self, record: dict):
        if self._handle is None or self._line_count >= self.max_lines:
            self._rotate()
        self._handle.write(json.dumps(record, default=str) + "\n")
        self._line_count += 1

    def flush(self):
        if self._handle:
            self._handle.flush()

    def close(self):
        if self._handle:
            self._handle.close()
            self._handle = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()


def normalize_value(value):
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, (list, tuple, set)):
        return [normalize_value(v) for v in value]
    if isinstance(value, dict):
        return {k: normalize_value(v) for k, v in value.items()}
    return str(value)


def safe_getattr(obj, *attrs, default=None):
    for attr in attrs:
        if hasattr(obj, attr):
            value = getattr(obj, attr)
            if value is not None:
                return value
    return default


def main():
    evidence_path = os.getenv("EVIDENCE_PATH")
    output_dir = os.getenv("OUTPUT_DIR")
    case_id = os.getenv("CASE_ID") or "unknown_case"
    evidence_uid = os.getenv("EVIDENCE_UID") or "unknown_evidence"

    if not evidence_path:
        raise ValueError("EVIDENCE_PATH environment variable not set")

    if not output_dir:
        raise ValueError("OUTPUT_DIR environment variable not set")

    output_dir_path = Path(output_dir)
    print(f"Ouverture de l'evidence: {evidence_path}")
    print(f"Répertoire de sortie: {output_dir_path}")

    target = Target.open(evidence_path)
    print("Target ouvert avec succès")

    total_events = 0

    try:
        evtx_plugin = target.evtx()
        with ChunkedJSONLWriter(output_dir_path, base_name="evtx_extract") as writer:
            for entry in evtx_plugin:
                total_events += 1

                doc = {
                    "case_id": case_id,
                    "evidence_uid": evidence_uid,
                    "source": "dissect.evtx",
                    "@timestamp": normalize_value(safe_getattr(entry, "ts", "timestamp")),
                    "hostname": normalize_value(safe_getattr(entry, "hostname", "Computer")),
                    "domain": normalize_value(safe_getattr(entry, "domain")),
                    "channel": normalize_value(safe_getattr(entry, "Channel")),
                    "computer": normalize_value(safe_getattr(entry, "Computer")),
                    "provider_name": normalize_value(
                        safe_getattr(entry, "Provider_Name", "ProviderName")
                    ),
                    "provider_guid": normalize_value(
                        safe_getattr(entry, "Provider_Guid", "ProviderGuid")
                    ),
                    "event_id": normalize_value(safe_getattr(entry, "EventID", "Event_Id")),
                    "event_id_qualifiers": normalize_value(
                        safe_getattr(entry, "EventID_Qualifiers")
                    ),
                    "event_record_id": normalize_value(
                        safe_getattr(entry, "EventRecordID", "RecordID")
                    ),
                    "event_name": normalize_value(safe_getattr(entry, "Event_Name", "EventName")),
                    "opcode": normalize_value(safe_getattr(entry, "Opcode")),
                    "task": normalize_value(safe_getattr(entry, "Task")),
                    "keywords": normalize_value(safe_getattr(entry, "Keywords")),
                    "level": normalize_value(safe_getattr(entry, "Level")),
                    "version": normalize_value(safe_getattr(entry, "Version")),
                    "thread_id": normalize_value(
                        safe_getattr(entry, "Execution_ThreadID", "Thread_ID", "ThreadID")
                    ),
                    "process_id": normalize_value(
                        safe_getattr(entry, "Execution_ProcessID", "ProcessID")
                    ),
                    "security_user_id": normalize_value(
                        safe_getattr(entry, "Security_UserID", "UserID")
                    ),
                    "correlation_activity_id": normalize_value(
                        safe_getattr(entry, "Correlation_ActivityID")
                    ),
                    "correlation_related_activity_id": normalize_value(
                        safe_getattr(entry, "Correlation_RelatedActivityID")
                    ),
                    "state_machine": normalize_value(safe_getattr(entry, "State_Machine")),
                    "state_machine_name": normalize_value(
                        safe_getattr(entry, "State_Machine_Name")
                    ),
                    "current_state": normalize_value(safe_getattr(entry, "Current_State")),
                    "event_data": normalize_value(safe_getattr(entry, "data", "EventData")),
                    "message": normalize_value(safe_getattr(entry, "message", "Message")),
                    "source_file": normalize_value(safe_getattr(entry, "source", "SourceFile")),
                }

                for int_field in ("event_id", "event_record_id", "thread_id", "process_id"):
                    if doc.get(int_field) is not None:
                        try:
                            doc[int_field] = int(doc[int_field])
                        except (TypeError, ValueError):
                            pass

                writer.write(doc)

                if total_events % FLUSH_INTERVAL == 0:
                    writer.flush()
                    print(f"Traité {total_events} événements EVTX...")

            writer.flush()
            created_files = list(writer.files)

        print(f"Total d'événements EVTX extraits: {total_events}")
        print(f"Fichiers générés ({len(created_files)}):")
        for path in created_files:
            print(f" - {path}")
    except Exception:
        print("Erreur lors de l'extraction EVTX")
        raise
    finally:
        target.close()
        print("Target fermé")


if __name__ == "__main__":
    try:
        main()
        print("Extraction EVTX terminée avec succès!")
    except Exception as err:
        print(f"Erreur: {err}")
        raise
