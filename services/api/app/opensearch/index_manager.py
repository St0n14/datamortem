"""
OpenSearch index management for dataMortem.

Handles creation, deletion, and lifecycle of case-specific indices.
"""

from opensearchpy import OpenSearch
from .mappings import get_base_mapping
import logging

logger = logging.getLogger(__name__)


def get_index_name(case_id: str) -> str:
    """
    Retourne le nom d'index pour un case.

    Pattern: datamortem-case-{case_id}

    Args:
        case_id: Case identifier

    Returns:
        Index name string
    """
    return f"datamortem-case-{case_id}"


def create_index_if_not_exists(
    client: OpenSearch,
    case_id: str,
    shard_count: int = 1,
    replica_count: int = 0
) -> bool:
    """
    Crée l'index pour un case s'il n'existe pas.

    Args:
        client: OpenSearch client instance
        case_id: Case identifier
        shard_count: Number of primary shards (default: 1 for dev)
        replica_count: Number of replicas (default: 0 for dev)

    Returns:
        True si créé, False si existe déjà

    Raises:
        Exception if index creation fails
    """
    index_name = get_index_name(case_id)

    if client.indices.exists(index=index_name):
        logger.info(f"Index {index_name} already exists")
        return False

    mapping = get_base_mapping(shard_count, replica_count)

    client.indices.create(
        index=index_name,
        body=mapping
    )

    logger.info(f"Created index: {index_name}")
    return True


def delete_case_index(client: OpenSearch, case_id: str) -> bool:
    """
    Supprime l'index d'un case.

    Args:
        client: OpenSearch client instance
        case_id: Case identifier

    Returns:
        True si supprimé, False si n'existe pas

    Raises:
        Exception if deletion fails
    """
    index_name = get_index_name(case_id)

    if not client.indices.exists(index=index_name):
        logger.warning(f"Index {index_name} does not exist")
        return False

    client.indices.delete(index=index_name)
    logger.info(f"Deleted index: {index_name}")
    return True


def refresh_index(client: OpenSearch, case_id: str):
    """
    Force un refresh de l'index pour rendre les documents visibles.

    Utile après indexation dans les tests ou pour forcer la visibilité.

    Args:
        client: OpenSearch client instance
        case_id: Case identifier
    """
    index_name = get_index_name(case_id)
    client.indices.refresh(index=index_name)
    logger.debug(f"Refreshed index: {index_name}")


def get_index_stats(client: OpenSearch, case_id: str) -> dict:
    """
    Récupère les statistiques d'un index.

    Args:
        client: OpenSearch client instance
        case_id: Case identifier

    Returns:
        Index stats dictionary

    Raises:
        Exception if index doesn't exist
    """
    index_name = get_index_name(case_id)
    stats = client.indices.stats(index=index_name)
    return stats['indices'][index_name]


def get_document_count(client: OpenSearch, case_id: str) -> int:
    """
    Retourne le nombre de documents dans l'index d'un case.

    Args:
        client: OpenSearch client instance
        case_id: Case identifier

    Returns:
        Number of documents
    """
    index_name = get_index_name(case_id)

    if not client.indices.exists(index=index_name):
        return 0

    count_response = client.count(index=index_name)
    return count_response['count']
