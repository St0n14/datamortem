"""
Extraction et ingestion de la $MFT à partir d'un collector Velociraptor.

Cette tâche :
1. Décompresse le collector (ZIP) si nécessaire
2. Recherche les artefacts $MFT bruts et les exports CSV Windows.NTFS.MFT
3. Parse les enregistrements via dissect.ntfs.mft
4. Normalise les données et les écrit au format Parquet pour ingestion
"""

from datetime import datetime, timezone
import csv
import os
import zipfile
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


def _extract_collector(evidence_path: str, target_dir: str) -> str:
    """
    Retourne le répertoire contenant les artefacts (extrait le ZIP si besoin).
    """
    if zipfile.is_zipfile(evidence_path):
        with zipfile.ZipFile(evidence_path, "r") as zip_ref:
            zip_ref.extractall(target_dir)
        return target_dir

    if os.path.isdir(evidence_path):
        return evidence_path

    raise FileNotFoundError(
        f"Evidence path {evidence_path} is neither a ZIP file nor a directory"
    )


@celery_app.task(bind=True, name="dissect_extract_mft")
def dissect_extract_mft(self, evidence_uid: str, task_run_id: int):
    """
    Pipeline complet d'extraction/parsing MFT avec sortie Parquet indexable.
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

        work_dir = f"/lake/{case_id}/{evidence_uid}/dissect_mft"
        os.makedirs(work_dir, exist_ok=True)

        extract_dir = os.path.join(work_dir, "extracted")
        os.makedirs(extract_dir, exist_ok=True)

        run.progress_message = "extracting Velociraptor collector"
        db.commit()

        artifacts_root = _extract_collector(evidence_path, extract_dir)

        run.progress_message = "searching for MFT artifacts"
        db.commit()

        artifacts = _discover_mft_artifacts(artifacts_root)
        total_candidates = len(artifacts["raw"]) + len(artifacts["csv"])

        if total_candidates == 0:
            raise FileNotFoundError(
                "No MFT artifacts found. Expected uploads/$MFT or Windows.NTFS.MFT CSV."
            )

        output_file = os.path.join(work_dir, "mft.parquet")
        buffer = ParquetBuffer(output_file, PARQUET_SCHEMA, batch_size=BATCH_SIZE)

        total_entries = 0
        processed_files = []

        for raw_path in artifacts["raw"]:
            filename = os.path.basename(raw_path)
            run.progress_message = f"parsing raw MFT {filename}"
            db.commit()
            try:
                count = _parse_raw_mft_file(
                    raw_path,
                    buffer=buffer,
                    case_id=case_id,
                    evidence_uid=evidence_uid,
                )
                processed_files.append({"path": raw_path, "type": "raw", "records": count})
                total_entries += count
            except Exception as raw_error:
                processed_files.append(
                    {"path": raw_path, "type": "raw", "error": str(raw_error)}
                )

        for csv_path in artifacts["csv"]:
            filename = os.path.basename(csv_path)
            run.progress_message = f"parsing CSV {filename}"
            db.commit()
            try:
                count = _parse_csv_mft_file(
                    csv_path,
                    buffer=buffer,
                    case_id=case_id,
                    evidence_uid=evidence_uid,
                )
                processed_files.append({"path": csv_path, "type": "csv", "records": count})
                total_entries += count
            except Exception as csv_error:
                processed_files.append(
                    {"path": csv_path, "type": "csv", "error": str(csv_error)}
                )

        buffer.close()

        if total_entries == 0:
            raise RuntimeError("No MFT records parsed from discovered artifacts")

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
            "artifacts": processed_files,
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
