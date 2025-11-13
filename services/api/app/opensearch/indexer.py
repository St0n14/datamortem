"""
OpenSearch indexer for Requiem.

Handles bulk indexing of parser results from Parquet/CSV files.
"""

from opensearchpy import OpenSearch, helpers
from typing import List, Dict, Iterator, Optional, Any
import pandas as pd
from datetime import datetime, timezone
import logging
import os

logger = logging.getLogger(__name__)


def _normalize_timestamp(value: Any) -> str:
    """
    Normalize various timestamp formats to ISO 8601 (UTC).
    Falls back to current UTC time when parsing fails.
    """
    def now_iso():
        return datetime.utcnow().replace(tzinfo=timezone.utc).isoformat()

    if value is None:
        return now_iso()

    if isinstance(value, datetime):
        ts = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return ts.astimezone(timezone.utc).isoformat()

    if isinstance(value, (int, float)):
        try:
            ts = datetime.fromtimestamp(value, tz=timezone.utc)
            return ts.isoformat()
        except Exception:
            return now_iso()

    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return now_iso()
        try:
            if raw.endswith("Z") and "+" not in raw:
                raw = raw[:-1] + "+00:00"
            parsed = datetime.fromisoformat(raw)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc).isoformat()
        except Exception:
            return now_iso()

    return now_iso()


def index_parquet_results(
    client: OpenSearch,
    case_id: str,
    evidence_uid: str,
    parser_name: str,
    parquet_path: str,
    batch_size: int = 500,
    case_name: Optional[str] = None
) -> dict:
    """
    Lit un fichier Parquet et l'indexe dans OpenSearch.

    Args:
        client: OpenSearch client instance
        case_id: Case identifier
        evidence_uid: Evidence identifier
        parser_name: Parser name (used for source.parser field)
        parquet_path: Path to Parquet file
        batch_size: Bulk indexing batch size (default: 500)
        case_name: Optional case name for enrichment

    Returns:
        Dict with stats: {indexed: int, failed: int, errors: list, total_rows: int}

    Raises:
        FileNotFoundError: If parquet_path doesn't exist
        Exception: For other indexing errors
    """
    from .index_manager import get_index_name, create_index_if_not_exists

    # Vérifie que le fichier existe
    if not os.path.exists(parquet_path):
        raise FileNotFoundError(f"Parquet file not found: {parquet_path}")

    # S'assure que l'index existe
    index_name = get_index_name(case_id)
    create_index_if_not_exists(client, case_id)

    logger.info(f"Starting indexation: {parquet_path} -> {index_name}")

    # Lit le Parquet
    try:
        df = pd.read_parquet(parquet_path)
    except Exception as e:
        logger.error(f"Failed to read Parquet file: {e}")
        raise

    total_rows = len(df)
    logger.info(f"Read {total_rows} rows from Parquet")

    # Stats
    stats = {
        "indexed": 0,
        "failed": 0,
        "errors": [],
        "total_rows": total_rows
    }

    # Génère les documents pour bulk indexing
    def generate_docs() -> Iterator[Dict]:
        for idx, row in df.iterrows():
            try:
                # Convertit la ligne en dict (gère NaN/NaT)
                doc = row.to_dict()

                # Remplace NaN/NaT par None
                doc = {k: (None if pd.isna(v) else v) for k, v in doc.items()}

                # Enrichit avec métadonnées communes
                doc["case"] = {"id": case_id}
                if case_name:
                    doc["case"]["name"] = case_name

                doc["evidence"] = {"uid": evidence_uid}
                doc["source"] = {"parser": parser_name}
                doc["indexed_at"] = datetime.utcnow().isoformat()

                # Normalise @timestamp si absent
                if "@timestamp" not in doc:
                    # Cherche d'autres champs timestamp possibles
                    if "timestamp" in doc:
                        doc["@timestamp"] = doc["timestamp"]
                    elif "time" in doc:
                        doc["@timestamp"] = doc["time"]
                    else:
                        # Fallback: utilise indexed_at
                        doc["@timestamp"] = doc["indexed_at"]

                yield {
                    "_index": index_name,
                    "_source": doc
                }
            except Exception as e:
                logger.warning(f"Error preparing document at row {idx}: {e}")
                stats["failed"] += 1
                if len(stats["errors"]) < 10:
                    stats["errors"].append(f"Row {idx}: {str(e)}")

    # Bulk indexing avec retries
    try:
        success_count, failed_items = helpers.bulk(
            client,
            generate_docs(),
            chunk_size=batch_size,
            raise_on_error=False,
            stats_only=False
        )

        stats["indexed"] = success_count

        if failed_items:
            stats["failed"] += len(failed_items)
            # Ajoute les erreurs (limite à 10)
            for item in failed_items[:10]:
                if "error" in item:
                    stats["errors"].append(str(item["error"]))

            logger.error(f"Failed to index {len(failed_items)} documents")

        logger.info(
            f"Indexation complete: {success_count} indexed, "
            f"{len(failed_items) if failed_items else 0} failed"
        )

    except Exception as e:
        logger.error(f"Bulk indexing failed: {e}")
        stats["errors"].append(f"Bulk operation error: {str(e)}")

    return stats


def index_csv_results(
    client: OpenSearch,
    case_id: str,
    evidence_uid: str,
    parser_name: str,
    csv_path: str,
    batch_size: int = 500,
    case_name: Optional[str] = None
) -> dict:
    """
    Lit un fichier CSV et l'indexe dans OpenSearch.

    Alternative à index_parquet_results pour les parsers qui produisent du CSV.

    Args:
        client: OpenSearch client instance
        case_id: Case identifier
        evidence_uid: Evidence identifier
        parser_name: Parser name
        csv_path: Path to CSV file
        batch_size: Bulk indexing batch size
        case_name: Optional case name

    Returns:
        Dict with stats
    """
    # Convertit CSV en DataFrame puis réutilise la logique Parquet
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    try:
        df = pd.read_csv(csv_path)
    except Exception as e:
        logger.error(f"Failed to read CSV file: {e}")
        raise

    # Sauvegarde temporairement en Parquet
    temp_parquet = csv_path.replace(".csv", ".parquet")
    df.to_parquet(temp_parquet, index=False)

    try:
        # Réutilise la logique Parquet
        stats = index_parquet_results(
            client=client,
            case_id=case_id,
            evidence_uid=evidence_uid,
            parser_name=parser_name,
            parquet_path=temp_parquet,
            batch_size=batch_size,
            case_name=case_name
        )
    finally:
        # Nettoie le fichier temporaire
        if os.path.exists(temp_parquet):
            os.remove(temp_parquet)

    return stats


def index_jsonl_results(
    client: OpenSearch,
    case_id: str,
    evidence_uid: str,
    parser_name: str,
    jsonl_path: str,
    batch_size: int = 500,
    case_name: Optional[str] = None
) -> dict:
    """
    Lit un fichier JSONL (JSON Lines) et l'indexe dans OpenSearch.

    Uses deterministic document IDs based on case_id + evidence_uid + file_path + metadata
    to prevent duplicates when reindexing the same data.

    Args:
        client: OpenSearch client instance
        case_id: Case identifier
        evidence_uid: Evidence identifier
        parser_name: Parser name
        jsonl_path: Path to JSONL file (one JSON object per line)
        batch_size: Bulk indexing batch size
        case_name: Optional case name

    Returns:
        Dict with stats: {indexed: int, failed: int, errors: list, total_rows: int}
    """
    import json
    import hashlib
    from .index_manager import get_index_name, create_index_if_not_exists

    # Vérifie que le fichier existe
    if not os.path.exists(jsonl_path):
        raise FileNotFoundError(f"JSONL file not found: {jsonl_path}")

    # S'assure que l'index existe
    index_name = get_index_name(case_id)
    create_index_if_not_exists(client, case_id)

    logger.info(f"Starting JSONL indexation: {jsonl_path} -> {index_name}")

    # Stats
    stats = {
        "indexed": 0,
        "failed": 0,
        "errors": [],
        "total_rows": 0
    }

    # Génère les documents depuis le fichier JSONL
    def generate_docs() -> Iterator[Dict]:
        with open(jsonl_path, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                stats["total_rows"] += 1
                line = line.strip()
                if not line:
                    continue

                try:
                    # Parse le JSON
                    doc = json.loads(line)

                    # Ensure doc is a dict
                    if not isinstance(doc, dict):
                        raise ValueError(f"Document is not a dict, got {type(doc)}")

                    # Normalize case_id / evidence_uid if they're at root level
                    # (some scripts put them there instead of nested)
                    if "case_id" in doc and "case" not in doc:
                        doc["case"] = {"id": doc.pop("case_id")}
                    if "evidence_uid" in doc and "evidence" not in doc:
                        doc["evidence"] = {"uid": doc.pop("evidence_uid")}

                    # Les événements générés ont déjà les bons champs
                    # Mais on enrichit quand même si nécessaire
                    if "case" not in doc:
                        doc["case"] = {}
                    elif not isinstance(doc["case"], dict):
                        # If case is not a dict, convert it
                        doc["case"] = {"id": str(doc["case"])}

                    if "id" not in doc["case"]:
                        doc["case"]["id"] = case_id
                    if case_name and "name" not in doc.get("case", {}):
                        doc["case"]["name"] = case_name

                    if "evidence" not in doc:
                        doc["evidence"] = {"uid": evidence_uid}
                    elif not isinstance(doc["evidence"], dict):
                        doc["evidence"] = {"uid": str(doc["evidence"])}

                    if "source" not in doc:
                        doc["source"] = {}
                    elif not isinstance(doc["source"], dict):
                        doc["source"] = {"parser": str(doc["source"])}

                    if "parser" not in doc.get("source", {}):
                        doc["source"]["parser"] = parser_name

                    doc["indexed_at"] = datetime.utcnow().isoformat()

                    # Vérifie @timestamp - use indexed_at if missing or null
                    if not doc.get("@timestamp"):
                        logger.warning(f"Line {line_num}: Missing or null @timestamp, using indexed_at")
                        doc["@timestamp"] = doc["indexed_at"]
                    else:
                        # Normalize timestamp format: replace space with T for ISO 8601
                        # OpenSearch requires strict ISO format: YYYY-MM-DDTHH:MM:SS.ffffff+00:00
                        timestamp = doc["@timestamp"]
                        if isinstance(timestamp, str) and " " in timestamp:
                            # Replace space with T: "2019-03-15 15:37:53" -> "2019-03-15T15:37:53"
                            doc["@timestamp"] = timestamp.replace(" ", "T", 1)

                    # Add a human-readable message field if missing
                    if "message" not in doc:
                        # Try to create a meaningful message from available fields
                        msg_parts = []

                        # For MFT entries
                        if "path" in doc:
                            msg_parts.append(f"File: {doc['path']}")
                        elif "file" in doc and "path" in doc.get("file", {}):
                            msg_parts.append(f"File: {doc['file']['path']}")
                        elif "file_name" in doc:
                            msg_parts.append(f"File: {doc['file_name']}")

                        # Add size if available
                        if "size" in doc:
                            size = doc["size"]
                            if isinstance(size, (int, float)):
                                if size >= 1024*1024:
                                    msg_parts.append(f"Size: {size/(1024*1024):.2f}MB")
                                elif size >= 1024:
                                    msg_parts.append(f"Size: {size/1024:.2f}KB")
                                else:
                                    msg_parts.append(f"Size: {size}B")

                        # Add record number for MFT
                        if "record_number" in doc:
                            msg_parts.append(f"MFT Record: {doc['record_number']}")

                        # Add segment if present
                        if "segment" in doc:
                            msg_parts.append(f"Segment: {doc['segment']}")

                        # Create message or fallback
                        if msg_parts:
                            doc["message"] = " | ".join(msg_parts)
                        else:
                            doc["message"] = f"Event from {parser_name}"

                    # Generate deterministic ID to prevent duplicates on reindex
                    # Uses case_id + evidence_uid + file_path (or other unique fields)
                    id_components = [case_id, evidence_uid, parser_name]

                    # Try to find unique identifiers in the document
                    # Priority: file.path > path > file.name > segment+path > record_number > full doc hash
                    if "file" in doc and "path" in doc.get("file", {}):
                        id_components.append(doc["file"]["path"])
                    elif "path" in doc:
                        # For MFT entries, path is at root level
                        path = doc["path"]
                        # Add segment if present for uniqueness (MFT can have same path, different segment)
                        if "segment" in doc:
                            id_components.append(f"{path}:segment={doc['segment']}")
                        else:
                            id_components.append(path)
                    elif "file" in doc and "name" in doc.get("file", {}):
                        id_components.append(doc["file"]["name"])
                    elif "record_number" in doc:
                        id_components.append(str(doc["record_number"]))
                    else:
                        # Fallback: hash the entire document (excluding indexed_at)
                        doc_copy = {k: v for k, v in doc.items() if k != "indexed_at"}
                        doc_hash = hashlib.sha256(
                            json.dumps(doc_copy, sort_keys=True).encode()
                        ).hexdigest()[:16]
                        id_components.append(doc_hash)

                    # Generate deterministic ID
                    doc_id = hashlib.sha256(
                        ":".join(str(c) for c in id_components).encode()
                    ).hexdigest()

                    yield {
                        "_index": index_name,
                        "_id": doc_id,  # Deterministic ID prevents duplicates
                        "_source": doc
                    }

                except json.JSONDecodeError as e:
                    logger.warning(f"Line {line_num}: Invalid JSON - {e}")
                    stats["failed"] += 1
                    if len(stats["errors"]) < 10:
                        stats["errors"].append(f"Line {line_num}: Invalid JSON")
                except Exception as e:
                    logger.warning(f"Line {line_num}: Error preparing document - {e}")
                    stats["failed"] += 1
                    if len(stats["errors"]) < 10:
                        stats["errors"].append(f"Line {line_num}: {str(e)}")

    # Bulk indexing
    try:
        success_count, failed_items = helpers.bulk(
            client,
            generate_docs(),
            chunk_size=batch_size,
            raise_on_error=False,
            stats_only=False
        )

        stats["indexed"] = success_count

        if failed_items:
            stats["failed"] += len(failed_items)

            # Debug: log the structure of the first failed item
            if failed_items:
                logger.error(f"First failed item structure: {failed_items[0]}")

            # Extract errors from failed items
            for item in failed_items[:10]:
                # failed_items structure from helpers.bulk is a list of dicts with keys like 'index', 'create', etc.
                # Each contains the action and error details
                error_msg = None

                # Try different structures
                if isinstance(item, dict):
                    # Try to find the error in common locations
                    for action in ['index', 'create', 'update']:
                        if action in item:
                            error_info = item[action].get('error')
                            if error_info:
                                if isinstance(error_info, dict):
                                    error_msg = f"{error_info.get('type', 'unknown')}: {error_info.get('reason', str(error_info))}"
                                else:
                                    error_msg = str(error_info)
                                break

                    # Fallback: just stringify the whole item
                    if not error_msg and 'error' in item:
                        error_msg = str(item['error'])

                if error_msg:
                    stats["errors"].append(error_msg)
                else:
                    # Last resort: dump the whole item
                    stats["errors"].append(f"Unknown error format: {str(item)[:200]}")

            logger.error(f"Failed to index {len(failed_items)} documents")

        logger.info(
            f"JSONL indexation complete: {success_count} indexed, "
            f"{len(failed_items) if failed_items else 0} failed from {stats['total_rows']} rows"
        )

    except Exception as e:
        logger.error(f"Bulk indexing failed: {e}", exc_info=True)
        stats["errors"].append(f"Bulk operation error: {str(e)}")

    return stats


def delete_case_documents(client: OpenSearch, case_id: str) -> dict:
    """
    Supprime tous les documents d'un case.

    Alternative à la suppression d'index, utile si on veut garder l'index vide.

    Args:
        client: OpenSearch client instance
        case_id: Case identifier

    Returns:
        Delete response dict
    """
    from .index_manager import get_index_name

    index_name = get_index_name(case_id)

    query = {
        "query": {
            "match_all": {}
        }
    }

    response = client.delete_by_query(index=index_name, body=query)
    logger.info(f"Deleted {response['deleted']} documents from {index_name}")

    return response


def index_events_batch(
    client: OpenSearch,
    events: List[Dict],
    case_id: str,
    batch_size: int = 500,
    case_name: Optional[str] = None
) -> dict:
    """
    Indexe une liste d'événements directement dans OpenSearch.
    Utilisé par l'endpoint /events/ingest.

    Args:
        client: OpenSearch client instance
        events: Liste de dictionnaires d'événements
        case_id: Case identifier
        batch_size: Bulk indexing batch size
        case_name: Optional case name

    Returns:
        Dict with stats: {indexed: int, failed: int, errors: list, total_events: int}
    """
    from .index_manager import get_index_name, create_index_if_not_exists

    if not events:
        return {"indexed": 0, "failed": 0, "errors": [], "total_events": 0}

    # S'assure que l'index existe
    index_name = get_index_name(case_id)
    create_index_if_not_exists(client, case_id)

    logger.info(f"Starting event batch indexation: {len(events)} events -> {index_name}")

    # Stats
    stats = {
        "indexed": 0,
        "failed": 0,
        "errors": [],
        "total_events": len(events)
    }

    # Génère les documents pour bulk indexing
    def generate_docs() -> Iterator[Dict]:
        for idx, event in enumerate(events):
            try:
                raw_timestamp = (
                    event.get("ts")
                    or event.get("@timestamp")
                    or event.get("timestamp")
                    or event.get("time")
                )
                doc = {
                    "@timestamp": _normalize_timestamp(raw_timestamp),
                    "case": {"id": case_id},
                    "evidence": {"uid": event.get("evidence_uid")},
                    "source": {"parser": event.get("source", "api_ingest")},
                    "event": {"type": event.get("source", "unknown")},
                    "host": {"hostname": event.get("host")},
                    "user": {"name": event.get("user")},
                    "message": event.get("message"),
                    "tags": event.get("tags", []),
                    "score": event.get("score"),
                    "indexed_at": datetime.utcnow().replace(tzinfo=timezone.utc).isoformat()
                }

                if case_name:
                    doc["case"]["name"] = case_name

                # Ajoute les données raw si présentes
                if event.get("raw"):
                    doc["raw"] = event["raw"]

                yield {
                    "_index": index_name,
                    "_source": doc
                }
            except Exception as e:
                logger.warning(f"Error preparing event document at index {idx}: {e}")
                stats["failed"] += 1
                if len(stats["errors"]) < 10:
                    stats["errors"].append(f"Event {idx}: {str(e)}")

    # Bulk indexing
    try:
        success_count, failed_items = helpers.bulk(
            client,
            generate_docs(),
            chunk_size=batch_size,
            raise_on_error=False,
            stats_only=False
        )

        stats["indexed"] = success_count

        if failed_items:
            stats["failed"] += len(failed_items)
            for item in failed_items[:10]:
                if "error" in item:
                    stats["errors"].append(str(item["error"]))
            logger.error(f"Failed to index {len(failed_items)} events")

        logger.info(
            f"Event batch indexation complete: {success_count} indexed, "
            f"{len(failed_items) if failed_items else 0} failed from {len(events)} events"
        )

    except Exception as e:
        logger.error(f"Bulk indexing failed: {e}")
        stats["errors"].append(f"Bulk operation error: {str(e)}")

    return stats
