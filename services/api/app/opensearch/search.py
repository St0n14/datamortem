"""
OpenSearch search helpers for Requiem.

Provides query builders and search utilities.
"""

from opensearchpy import OpenSearch
from typing import Optional, Dict, List, Any, Tuple, Union
import logging

logger = logging.getLogger(__name__)


def build_query_string_query(
    query: str,
    default_field: str = "message",
    default_operator: str = "AND"
) -> dict:
    """
    Construit une query_string simple.

    Args:
        query: Query string (ex: "svchost.exe AND suspicious")
        default_field: Field par défaut (default: "message")
        default_operator: Opérateur par défaut AND/OR (default: "AND")

    Returns:
        Query dict
    """
    return {
        "query_string": {
            "query": query,
            "default_field": default_field,
            "default_operator": default_operator
        }
    }


def build_term_filters(filters: Dict[str, Any]) -> List[dict]:
    """
    Construit une liste de filtres term depuis un dict.

    Args:
        filters: Dict {field: value}

    Returns:
        List of term queries
    """
    return [
        {"term": {field: value}}
        for field, value in filters.items()
        if value is not None
    ]


def _scalar_clause(field: str, value: Any, operator: str) -> dict:
    """
    Helper that chooses term vs match_phrase depending on value type.
    """
    if isinstance(value, (int, float, bool)):
        return {"term": {field: value}}
    if field.endswith(".keyword"):
        return {"term": {field: value}}
    if operator in {"contains", "equals"}:
        return {"match_phrase": {field: value}}
    return {"term": {field: value}}


def build_field_filter_clauses(
    field_filters: List[Dict[str, Any]]
) -> Tuple[List[dict], List[dict]]:
    """
    Construit des clauses must/must_not depuis des filtres avancés.

    Args:
        field_filters: List of dicts {field, operator, value}

    Returns:
        Tuple (must_clauses, must_not_clauses)
    """
    must: List[dict] = []
    must_not: List[dict] = []

    for f in field_filters:
        field = f.get("field")
        operator = f.get("operator", "equals")
        value = f.get("value")

        if not field:
            continue

        clause: Optional[dict] = None

        if operator == "equals":
            clause = _scalar_clause(field, value, operator)
            must.append(clause)
        elif operator == "not_equals":
            clause = _scalar_clause(field, value, operator)
            must_not.append(clause)
        elif operator == "contains":
            clause = {"match_phrase": {field: value}}
            must.append(clause)
        elif operator == "prefix":
            clause = {"prefix": {field: value}}
            must.append(clause)
        elif operator == "wildcard":
            clause = {"wildcard": {field: value}}
            must.append(clause)
        elif operator == "exists":
            clause = {"exists": {"field": field}}
            must.append(clause)
        elif operator == "missing":
            clause = {"exists": {"field": field}}
            must_not.append(clause)

    return must, must_not


def build_range_query(
    field: str,
    gte: Optional[Any] = None,
    lte: Optional[Any] = None,
    gt: Optional[Any] = None,
    lt: Optional[Any] = None
) -> dict:
    """
    Construit une range query.

    Args:
        field: Field name
        gte: Greater than or equal
        lte: Less than or equal
        gt: Greater than
        lt: Less than

    Returns:
        Range query dict
    """
    range_params = {}
    if gte is not None:
        range_params["gte"] = gte
    if lte is not None:
        range_params["lte"] = lte
    if gt is not None:
        range_params["gt"] = gt
    if lt is not None:
        range_params["lt"] = lt

    return {"range": {field: range_params}}


def build_bool_query(
    query: Optional[str],
    filters: Optional[Dict[str, Any]] = None,
    field_filters: Optional[List[Dict[str, Any]]] = None,
    time_range: Optional[Dict[str, Any]] = None,
) -> dict:
    """
    Construit une query bool combinant query string, filtres et range.
    """
    must: List[dict] = []
    must_not: List[dict] = []

    if query and query.strip() and query.strip() != "*":
        must.append(build_query_string_query(query))
    else:
        must.append({"match_all": {}})

    if filters:
        must.extend(build_term_filters(filters))

    if field_filters:
        extra_must, extra_must_not = build_field_filter_clauses(field_filters)
        must.extend(extra_must)
        must_not.extend(extra_must_not)

    if time_range:
        must.append(build_range_query("@timestamp", **time_range))

    bool_query: Dict[str, Any] = {}
    if must:
        bool_query["must"] = must
    if must_not:
        bool_query["must_not"] = must_not

    return {"bool": bool_query}


def search_events(
    client: OpenSearch,
    index_name: str,
    query: str,
    filters: Optional[Dict[str, Any]] = None,
    field_filters: Optional[List[Dict[str, Any]]] = None,
    time_range: Optional[Dict[str, str]] = None,
    from_: int = 0,
    size: int = 50,
    sort_by: str = "@timestamp",
    sort_order: str = "desc"
) -> dict:
    """
    Recherche générique dans un index.

    Args:
        client: OpenSearch client
        index_name: Index name
        query: Query string
        filters: Optional filters dict
        time_range: Optional time range {gte: "...", lte: "..."}
        from_: Pagination offset
        size: Number of results
        sort_by: Sort field
        sort_order: Sort order (asc/desc)

    Returns:
        Search response dict
    """
    bool_query = build_bool_query(
        query=query,
        filters=filters,
        field_filters=field_filters or [],
        time_range=time_range,
    )

    query_body = {
        "query": bool_query,
        "from": from_,
        "size": size,
        "sort": [{sort_by: {"order": sort_order}}]
    }

    logger.debug(f"Search query: {query_body}")

    response = client.search(
        index=index_name,
        body=query_body
    )

    return response


def aggregate_field(
    client: OpenSearch,
    index_name: str,
    field: str,
    size: int = 10,
    query: Optional[dict] = None
) -> dict:
    """
    Agrégation terms sur un champ.

    Args:
        client: OpenSearch client
        index_name: Index name
        field: Field to aggregate
        size: Number of buckets
        query: Optional query to filter results

    Returns:
        Aggregation response dict
    """
    query_body = {
        "size": 0,
        "aggs": {
            "top_values": {
                "terms": {
                    "field": field,
                    "size": size
                }
            }
        }
    }

    # Ajoute une query si fournie
    if query:
        query_body["query"] = query

    response = client.search(
        index=index_name,
        body=query_body
    )

    return response["aggregations"]["top_values"]


def timeline_aggregation(
    client: OpenSearch,
    index_name: str,
    interval: str = "1h",
    time_field: str = "@timestamp",
    query: Optional[dict] = None
) -> dict:
    """
    Agrégation temporelle (timeline).

    Args:
        client: OpenSearch client
        index_name: Index name
        interval: Time interval (1m, 1h, 1d, etc.)
        time_field: Time field to aggregate on
        query: Optional query to filter

    Returns:
        Timeline aggregation dict
    """
    query_body = {
        "size": 0,
        "aggs": {
            "timeline": {
                "date_histogram": {
                    "field": time_field,
                    "fixed_interval": interval,
                    "min_doc_count": 0
                }
            }
        }
    }

    if query:
        query_body["query"] = query

    response = client.search(
        index=index_name,
        body=query_body
    )

    return response["aggregations"]["timeline"]


def get_document_by_id(
    client: OpenSearch,
    index_name: str,
    doc_id: str
) -> Optional[dict]:
    """
    Récupère un document par son ID.

    Args:
        client: OpenSearch client
        index_name: Index name
        doc_id: Document ID

    Returns:
        Document dict or None if not found
    """
    try:
        response = client.get(index=index_name, id=doc_id)
        return response["_source"]
    except Exception as e:
        logger.warning(f"Document {doc_id} not found: {e}")
        return None


def scroll_search(
    client: OpenSearch,
    index_name: str,
    query: dict,
    scroll_time: str = "5m",
    size: int = 1000
):
    """
    Générateur pour scroll search (grandes quantités de résultats).

    Args:
        client: OpenSearch client
        index_name: Index name
        query: Query body
        scroll_time: Scroll context duration
        size: Page size

    Yields:
        Documents
    """
    query["size"] = size

    response = client.search(
        index=index_name,
        body=query,
        scroll=scroll_time
    )

    scroll_id = response["_scroll_id"]
    hits = response["hits"]["hits"]

    while hits:
        for hit in hits:
            yield hit["_source"]

        # Scroll suivant
        response = client.scroll(
            scroll_id=scroll_id,
            scroll=scroll_time
        )

        scroll_id = response["_scroll_id"]
        hits = response["hits"]["hits"]

    # Nettoie le scroll context
    client.clear_scroll(scroll_id=scroll_id)
