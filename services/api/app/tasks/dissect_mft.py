"""
Extraction et ingestion de la $MFT à partir d'une image disque E01.

Cette tâche :
1. Ouvre l'image E01 avec dissect.target
2. Extrait la $MFT depuis le système de fichiers NTFS
3. Parse les enregistrements via dissect.ntfs.mft
4. Normalise les données et les écrit au format Parquet pour ingestion
"""

from datetime import datetime, timezone
import csv
import os
from typing import Any, Dict, Iterable, List, Optional

import pyarrow as pa
import pyarrow.parquet as pq

from ..celery_app import celery_app
from ..db import SessionLocal
from ..models import TaskRun, Evidence

PARQUET_SCHEMA = pa.schema(
    [
        pa.field("@timestamp", pa.string()),
        pa.field("event_type", pa.string()),
        pa.field("event_action", pa.string()),
        pa.field("file_path", pa.string()),
        pa.field("file_name", pa.string()),
        pa.field("file_size", pa.int64()),
        pa.field("mft_record_number", pa.int64()),
        pa.field("case_id", pa.string()),
        pa.field("evidence_uid", pa.string()),
        pa.field("source_parser", pa.string()),
        pa.field("source_mft_file", pa.string()),
        pa.field("source_origin", pa.string()),
        pa.field("si_created", pa.string()),
        pa.field("si_modified", pa.string()),
        pa.field("si_accessed", pa.string()),
        pa.field("si_changed", pa.string()),
        pa.field("flags", pa.string()),
        pa.field("is_directory", pa.bool_()),
        pa.field("ingested_at", pa.string()),
    ],
    metadata={"parser": "dissect_mft"},
)

CSV_PATH_KEYS = ["full_path", "fullpath", "path", "filepath", "file_path"]
CSV_NAME_KEYS = ["filename", "file_name", "name"]
CSV_SIZE_KEYS = ["size", "filesize", "file_size"]
CSV_RECORD_KEYS = ["record", "record_number", "recordindex", "recordnumber"]
CSV_CREATE_KEYS = ["si_create", "creation_time", "created"]
CSV_MOD_KEYS = ["si_mtime", "modified", "mtime", "last_modified"]
CSV_ACC_KEYS = ["si_atime", "accessed", "last_accessed", "access_time"]
CSV_CHG_KEYS = ["si_ctime", "changed", "entry_modified", "ctime"]
CSV_DIR_KEYS = ["is_directory", "directory"]
CSV_FLAGS_KEYS = ["flags", "attributes"]

BATCH_SIZE = 1000


class ParquetBuffer:
    """Écrit les enregistrements au format Parquet par batch pour limiter la RAM."""

    def __init__(self, output_path: str, schema: pa.Schema, batch_size: int = 1000):
        self.output_path = output_path
        self.schema = schema
        self.batch_size = batch_size
        self._buffer: List[Dict[str, Any]] = []
        self._writer: Optional[pq.ParquetWriter] = None

    def append(self, record: Dict[str, Any]):
        self._buffer.append(record)
        if len(self._buffer) >= self.batch_size:
            self.flush()

    def flush(self):
        if not self._buffer:
            return
        table = pa.Table.from_pylist(self._buffer, schema=self.schema)
        if self._writer is None:
            os.makedirs(os.path.dirname(self.output_path), exist_ok=True)
            self._writer = pq.ParquetWriter(
                self.output_path, self.schema, compression="snappy"
            )
        self._writer.write_table(table)
        self._buffer.clear()

    def close(self):
        self.flush()
        if self._writer is not None:
            self._writer.close()
            self._writer = None


def _utc_now_iso() -> str:
    return datetime.utcnow().replace(tzinfo=timezone.utc).isoformat().replace(
        "+00:00", "Z"
    )


def _isoformat(value: Any) -> Optional[str]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt_value = value
        if dt_value.tzinfo is None:
            dt_value = dt_value.replace(tzinfo=timezone.utc)
        return dt_value.isoformat().replace("+00:00", "Z")
    return str(value)


def _safe_int(value: Any) -> Optional[int]:
    if value in (None, "", "null"):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes"}:
            return True
        if lowered in {"false", "0", "no"}:
            return False
    return None


def _decode_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore")
    return str(value)


def _normalize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    normalized: Dict[str, Any] = {}
    for key, value in row.items():
        if key is None:
            continue
        norm_key = key.strip().lower()
        normalized[norm_key] = value.strip() if isinstance(value, str) else value
    return normalized


def _value_from_row(row: Dict[str, Any], candidates: Iterable[str]) -> Optional[Any]:
    for key in candidates:
        lowered = key.lower()
        if lowered in row and row[lowered] not in (None, ""):
            return row[lowered]
    return None


def _serialize_flags(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, (list, set, tuple)):
        return "|".join(str(item) for item in value)
    return str(value)


def _build_record(
    *,
    case_id: str,
    evidence_uid: str,
    source_name: str,
    origin: str,
    path_value: Optional[str],
    name_value: Optional[str],
    size_value: Optional[int],
    record_number: Optional[int],
    timestamps: Dict[str, Optional[str]],
    flags: Optional[str],
    is_directory: Optional[bool],
) -> Dict[str, Any]:
    timestamp = (
        timestamps.get("modified")
        or timestamps.get("created")
        or timestamps.get("accessed")
        or _utc_now_iso()
    )

    return {
        "@timestamp": timestamp,
        "event_type": "file",
        "event_action": "mft_record",
        "file_path": path_value or name_value,
        "file_name": name_value,
        "file_size": size_value,
        "mft_record_number": record_number,
        "case_id": case_id,
        "evidence_uid": evidence_uid,
        "source_parser": "dissect_mft",
        "source_mft_file": source_name,
        "source_origin": origin,
        "si_created": timestamps.get("created"),
        "si_modified": timestamps.get("modified"),
        "si_accessed": timestamps.get("accessed"),
        "si_changed": timestamps.get("changed"),
        "flags": flags,
        "is_directory": is_directory,
        "ingested_at": _utc_now_iso(),
    }


def _record_from_mft_entry(
    entry: Any,
    *,
    case_id: str,
    evidence_uid: str,
    source_name: str,
) -> Dict[str, Any]:
    path_value = _decode_text(getattr(entry, "full_path", None))
    name_value = _decode_text(getattr(entry, "filename", None))
    size_value = _safe_int(getattr(entry, "size", None))
    record_number = _safe_int(getattr(entry, "record_number", None))
    is_directory = getattr(entry, "is_directory", lambda: False)()

    timestamps = {
        "created": _isoformat(getattr(entry, "si_create", None)),
        "modified": _isoformat(getattr(entry, "si_mtime", None)),
        "accessed": _isoformat(getattr(entry, "si_atime", None)),
        "changed": _isoformat(getattr(entry, "si_ctime", None)),
    }

    flags = _serialize_flags(getattr(entry, "flags", None))

    return _build_record(
        case_id=case_id,
        evidence_uid=evidence_uid,
        source_name=source_name,
        origin="raw",
        path_value=path_value,
        name_value=name_value,
        size_value=size_value,
        record_number=record_number,
        timestamps=timestamps,
        flags=flags,
        is_directory=is_directory,
    )




def _record_from_csv_row(
    row: Dict[str, Any],
    *,
    case_id: str,
    evidence_uid: str,
    source_name: str,
) -> Dict[str, Any]:
    path_value = _value_from_row(row, CSV_PATH_KEYS)
    name_value = _value_from_row(row, CSV_NAME_KEYS)
    size_value = _safe_int(_value_from_row(row, CSV_SIZE_KEYS))
    record_number = _safe_int(_value_from_row(row, CSV_RECORD_KEYS))

    timestamps = {
        "created": _isoformat(_value_from_row(row, CSV_CREATE_KEYS)),
        "modified": _isoformat(_value_from_row(row, CSV_MOD_KEYS)),
        "accessed": _isoformat(_value_from_row(row, CSV_ACC_KEYS)),
        "changed": _isoformat(_value_from_row(row, CSV_CHG_KEYS)),
    }

    is_directory = _safe_bool(_value_from_row(row, CSV_DIR_KEYS))
    flags = _serialize_flags(_value_from_row(row, CSV_FLAGS_KEYS))

    return _build_record(
        case_id=case_id,
        evidence_uid=evidence_uid,
        source_name=source_name,
        origin="csv",
        path_value=_decode_text(path_value),
        name_value=_decode_text(name_value),
        size_value=size_value,
        record_number=record_number,
        timestamps=timestamps,
        flags=flags,
        is_directory=is_directory,
    )


def _parse_raw_mft_file(
    mft_path: str,
    *,
    buffer: ParquetBuffer,
    case_id: str,
    evidence_uid: str,
) -> int:
    try:
        from dissect.ntfs.mft import MFT  # type: ignore
    except Exception as import_err:  # pragma: no cover
        raise RuntimeError(
            "dissect-target (dissect.ntfs) is required to parse $MFT files"
        ) from import_err

    total = 0
    source_name = os.path.basename(mft_path)

    with open(mft_path, "rb") as handle:
        mft_obj = MFT(handle)
        for entry in mft_obj.records():
            try:
                is_allocated = getattr(entry, "is_allocated", lambda: True)()
                if not is_allocated:
                    continue
                record = _record_from_mft_entry(
                    entry,
                    case_id=case_id,
                    evidence_uid=evidence_uid,
                    source_name=source_name,
                )
                buffer.append(record)
                total += 1
            except Exception:
                continue

    return total


def _parse_csv_mft_file(
    csv_path: str,
    *,
    buffer: ParquetBuffer,
    case_id: str,
    evidence_uid: str,
) -> int:
    total = 0
    source_name = os.path.basename(csv_path)

    with open(csv_path, "r", encoding="utf-8", errors="ignore") as csv_handle:
        reader = csv.DictReader(csv_handle)
        for row in reader:
            try:
                normalized = _normalize_row(row)
                record = _record_from_csv_row(
                    normalized,
                    case_id=case_id,
                    evidence_uid=evidence_uid,
                    source_name=source_name,
                )
                buffer.append(record)
                total += 1
            except Exception:
                continue

    return total


def _discover_mft_artifacts(root_dir: str) -> Dict[str, List[str]]:
    raw_files: List[str] = []
    csv_files: List[str] = []

    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            full_path = os.path.join(dirpath, filename)
            lower = filename.lower()

            if lower.endswith(".csv") and "mft" in lower:
                csv_files.append(full_path)
                continue

            if lower.endswith(".log") or lower.endswith(".txt"):
                continue

            if "$mft" in lower or "%24mft" in lower or lower.endswith(".mft"):
                raw_files.append(full_path)

    return {"raw": raw_files, "csv": csv_files}


def _parse_mft_from_evidence(
    evidence_path: str,
    *,
    buffer: ParquetBuffer,
    case_id: str,
    evidence_uid: str,
) -> int:
    """
    Ouvre une evidence (fichier E01) avec dissect.target et extrait la MFT.
    
    Utilise un context manager pour garantir la libération des ressources
    même pour les gros fichiers de plusieurs Go.
    """
    try:
        from dissect.target import Target  # type: ignore
    except Exception as import_err:
        raise RuntimeError(
            "dissect-target is required to open E01 images"
        ) from import_err
    
    if not os.path.exists(evidence_path):
        raise FileNotFoundError(f"Evidence path not found: {evidence_path}")
    
    total = 0
    source_name = "E01_image"
    
    # Utiliser un context manager pour garantir la fermeture propre des ressources
    # Important pour les gros fichiers E01 de plusieurs Go
    try:
        with Target.open(evidence_path) as target:
            # Parcourir tous les systèmes de fichiers dans le target
            for fs in target.fs:
                try:
                    # Vérifier si le système de fichiers a une MFT (NTFS)
                    if not hasattr(fs, "mft"):
                        continue
                    
                    # Parcourir tous les enregistrements MFT
                    # dissect.target lit de manière lazy, donc pas de problème de mémoire
                    for entry in fs.mft.records():
                        try:
                            # Filtrer les enregistrements non alloués
                            is_allocated = getattr(entry, "is_allocated", lambda: True)()
                            if not is_allocated:
                                continue
                            
                            # Créer le record normalisé
                            record = _record_from_mft_entry(
                                entry,
                                case_id=case_id,
                                evidence_uid=evidence_uid,
                                source_name=source_name,
                            )
                            buffer.append(record)
                            total += 1
                        except Exception:
                            # Ignorer les enregistrements invalides
                            continue
                except (FileNotFoundError, AttributeError, NotImplementedError):
                    # Ignorer les systèmes de fichiers non NTFS ou non supportés
                    continue
    except Exception as e:
        raise RuntimeError(
            f"Failed to parse MFT from evidence {evidence_path}: {str(e)}"
        ) from e
    
    return total


@celery_app.task(bind=True, name="dissect_extract_mft")
def dissect_extract_mft(self, evidence_uid: str, task_run_id: int):
    """
    Pipeline complet d'extraction/parsing MFT depuis une image E01 avec sortie Parquet indexable.
    """
    db = SessionLocal()

    try:
        run = db.query(TaskRun).filter_by(id=task_run_id).one()
        ev = db.query(Evidence).filter_by(evidence_uid=evidence_uid).one()

        case_id = ev.case.case_id
        evidence_path = ev.local_path

        run.status = "running"
        run.started_at_utc = datetime.utcnow()
        run.progress_message = "preparing dissect MFT extraction"
        db.commit()

        if not evidence_path or not os.path.exists(evidence_path):
            raise FileNotFoundError(f"Evidence path not found: {evidence_path}")

        work_dir = f"/lake/{case_id}/evidences/{evidence_uid}/dissect_mft"
        os.makedirs(work_dir, exist_ok=True)

        output_file = os.path.join(work_dir, "mft.parquet")
        buffer = ParquetBuffer(output_file, PARQUET_SCHEMA, batch_size=BATCH_SIZE)

        run.progress_message = "opening E01 image and extracting MFT records"
        db.commit()

        # Extraire la MFT directement depuis l'image E01
        # La fonction utilise un context manager pour gérer les ressources
        total_entries = _parse_mft_from_evidence(
            evidence_path,
            buffer=buffer,
            case_id=case_id,
            evidence_uid=evidence_uid,
        )

        buffer.close()

        if total_entries == 0:
            raise RuntimeError("No MFT records found in E01 image. Expected NTFS filesystem.")

        run.status = "success"
        run.ended_at_utc = datetime.utcnow()
        run.output_path = output_file
        run.progress_message = f"parsed {total_entries} entries, launching ingestion"
        db.commit()

        from ..tasks.index_results import index_results_task

        index_results_task.delay(
            task_run_id=task_run_id,
            file_path=output_file,
            parser_name="dissect_mft",
        )

        return {
            "status": "success",
            "output_path": output_file,
            "records": total_entries,
            "source": "E01_image",
        }

    except Exception as exc:
        run.status = "error"
        run.ended_at_utc = datetime.utcnow()
        run.error_message = str(exc)
        run.progress_message = "failed"
        db.commit()
        raise
    finally:
        db.close()
