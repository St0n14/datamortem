"""
OpenSearch client management.

Provides singleton client instance with proper lifecycle management.
"""

from opensearchpy import OpenSearch
from typing import Optional
import logging

logger = logging.getLogger(__name__)

_opensearch_client: Optional[OpenSearch] = None


def get_opensearch_client(settings) -> OpenSearch:
    """
    Retourne le client OpenSearch singleton.
    Crée la connexion si elle n'existe pas.

    Args:
        settings: Application settings with OpenSearch configuration

    Returns:
        OpenSearch client instance
    """
    global _opensearch_client

    if _opensearch_client is None:
        auth = None
        if settings.dm_opensearch_user and settings.dm_opensearch_password:
            auth = (settings.dm_opensearch_user, settings.dm_opensearch_password)

        _opensearch_client = OpenSearch(
            hosts=[{
                'host': settings.dm_opensearch_host,
                'port': settings.dm_opensearch_port
            }],
            http_auth=auth,
            use_ssl=(settings.dm_opensearch_scheme == "https"),
            verify_certs=settings.dm_opensearch_verify_certs,
            ssl_show_warn=settings.dm_opensearch_ssl_show_warn,
            timeout=30,
            max_retries=settings.dm_opensearch_max_retries,
            retry_on_timeout=True
        )

        logger.info(
            f"OpenSearch client initialized: "
            f"{settings.dm_opensearch_scheme}://{settings.dm_opensearch_host}:"
            f"{settings.dm_opensearch_port}"
        )

    return _opensearch_client


def close_opensearch_client():
    """
    Ferme proprement la connexion OpenSearch.
    Appelé lors du shutdown de l'application.
    """
    global _opensearch_client
    if _opensearch_client:
        _opensearch_client.close()
        _opensearch_client = None
        logger.info("OpenSearch client closed")


def test_connection(client: OpenSearch) -> dict:
    """
    Teste la connexion OpenSearch.

    Args:
        client: OpenSearch client instance

    Returns:
        Cluster info dict if successful

    Raises:
        Exception if connection fails
    """
    try:
        info = client.info()
        logger.info(f"OpenSearch connection OK: {info['version']['number']}")
        return info
    except Exception as e:
        logger.error(f"OpenSearch connection failed: {e}")
        raise
