"""
OpenSearch indexer for dataMortem.

Handles bulk indexing of parser results from Parquet/CSV files.
"""

from opensearchpy import OpenSearch, helpers
from typing import List, Dict, Iterator, Optional
import pandas as pd
from datetime import datetime
import logging
import os

logger = logging.getLogger(__name__)


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

                    # Les événements générés ont déjà les bons champs
                    # Mais on enrichit quand même si nécessaire
                    if "case" not in doc:
                        doc["case"] = {}
                    if "id" not in doc["case"]:
                        doc["case"]["id"] = case_id
                    if case_name and "name" not in doc.get("case", {}):
                        doc["case"]["name"] = case_name

                    if "evidence" not in doc:
                        doc["evidence"] = {"uid": evidence_uid}

                    if "source" not in doc:
                        doc["source"] = {}
                    if "parser" not in doc.get("source", {}):
                        doc["source"]["parser"] = parser_name

                    doc["indexed_at"] = datetime.utcnow().isoformat()

                    # Vérifie @timestamp
                    if "@timestamp" not in doc:
                        logger.warning(f"Line {line_num}: Missing @timestamp, using indexed_at")
                        doc["@timestamp"] = doc["indexed_at"]

                    yield {
                        "_index": index_name,
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
            for item in failed_items[:10]:
                if "error" in item:
                    stats["errors"].append(str(item["error"]))
            logger.error(f"Failed to index {len(failed_items)} documents")

        logger.info(
            f"JSONL indexation complete: {success_count} indexed, "
            f"{len(failed_items) if failed_items else 0} failed from {stats['total_rows']} rows"
        )

    except Exception as e:
        logger.error(f"Bulk indexing failed: {e}")
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
