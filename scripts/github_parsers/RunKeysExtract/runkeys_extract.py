#!/usr/bin/env python3
import json
import os
from pathlib import Path

from dissect.target import Target

MAX_LINES_PER_FILE = 100_000
FLUSH_INTERVAL = 5_000


class ChunkedJSONLWriter:
    """Rotate JSONL files once the line limit is reached."""

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


def parse_command(command_tuple):
    """Split dissect command tuple (executable, args) into clearer fields."""
    if not command_tuple:
        return None, None
    executable = command_tuple[0] if isinstance(command_tuple, (tuple, list)) and command_tuple else command_tuple
    args = []
    if isinstance(command_tuple, (tuple, list)) and len(command_tuple) > 1:
        args = command_tuple[1]
    return normalize_value(executable), normalize_value(args)


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

    total_entries = 0
    try:
        runkeys_plugin = target.runkeys()
        with ChunkedJSONLWriter(output_dir_path, base_name="runkeys_extract") as writer:
            for entry in runkeys_plugin:
                total_entries += 1
                executable, args = parse_command(
                    safe_getattr(entry, "command", default=None)
                )

                doc = {
                    "case_id": case_id,
                    "evidence_uid": evidence_uid,
                    "source": "dissect.runkeys",
                    "@timestamp": normalize_value(safe_getattr(entry, "ts", "timestamp")),
                    "hostname": normalize_value(safe_getattr(entry, "hostname")),
                    "domain": normalize_value(safe_getattr(entry, "domain")),
                    "name": normalize_value(safe_getattr(entry, "name")),
                    "registry_key": normalize_value(safe_getattr(entry, "key", "regf_key_path")),
                    "registry_hive": normalize_value(
                        safe_getattr(entry, "regf_hive_path", "hive_path")
                    ),
                    "registry_subkey": normalize_value(
                        safe_getattr(entry, "regf_key_path", "subkey_path")
                    ),
                    "username": normalize_value(safe_getattr(entry, "username")),
                    "user_id": normalize_value(safe_getattr(entry, "user_id")),
                    "user_group": normalize_value(safe_getattr(entry, "user_group")),
                    "user_home": normalize_value(safe_getattr(entry, "user_home")),
                    "command_raw": normalize_value(safe_getattr(entry, "command")),
                    "command_executable": executable,
                    "command_args": args,
                }

                writer.write(doc)

                if total_entries % FLUSH_INTERVAL == 0:
                    writer.flush()
                    print(f"Traité {total_entries} clés Run...")

            writer.flush()
            created_files = list(writer.files)

        print(f"Total d'entrées Run extraites: {total_entries}")
        print(f"Fichiers générés ({len(created_files)}):")
        for path in created_files:
            print(f" - {path}")
    except Exception:
        print("Erreur lors de l'extraction des clés Run")
        raise
    finally:
        print("Target fermé")


if __name__ == "__main__":
    try:
        main()
        print("Extraction RunKeys terminée avec succès!")
    except Exception as err:
        print(f"Erreur: {err}")
        raise
