"""
OpenSearch module for dataMortem.

Provides indexing, search, and management capabilities for forensic artifacts.
"""

from .client import get_opensearch_client, close_opensearch_client
from .index_manager import (
    get_index_name,
    create_index_if_not_exists,
    delete_case_index
)
from .indexer import index_parquet_results

__all__ = [
    "get_opensearch_client",
    "close_opensearch_client",
    "get_index_name",
    "create_index_if_not_exists",
    "delete_case_index",
    "index_parquet_results",
]
