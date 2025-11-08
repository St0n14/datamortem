"""
Search router for OpenSearch API endpoints.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from ..schemas.opensearch_schemas import (
    SearchRequest,
    SearchResponse,
    AggregationRequest,
    AggregationResponse,
    AggregationBucket,
    TimelineRequest,
    TimelineResponse,
    TimelineBucket,
    IndexStatsResponse,
)
from ..opensearch.client import get_opensearch_client
from ..opensearch.index_manager import get_index_name, get_document_count, get_index_stats
from ..opensearch.search import (
    search_events,
    aggregate_field,
    timeline_aggregation,
    build_bool_query,
)
from ..config import settings
from ..models import User
from ..auth.dependencies import get_current_active_user, get_current_admin_user
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["search"], prefix="/search")


def get_opensearch_client_dep():
    """Dependency pour obtenir le client OpenSearch."""
    return get_opensearch_client(settings)


@router.post("/query", response_model=SearchResponse)
def search_case_events(
    req: SearchRequest,
    client=Depends(get_opensearch_client_dep),
    current_user: User = Depends(get_current_active_user)
):
    """
    Recherche dans les événements d'un case.

    Supporte:
    - Query string OpenSearch (syntaxe Lucene)
    - Filtres par champ
    - Filtres temporels
    - Pagination
    - Tri

    Example query strings:
    - `svchost.exe` - Recherche simple
    - `file.name:cmd.exe AND process.pid:>1000` - Recherche avec filtres
    - `"malicious activity"` - Phrase exacte
    """
    index_name = get_index_name(req.case_id)

    # Vérifie que l'index existe
    if not client.indices.exists(index=index_name):
        raise HTTPException(
            status_code=404,
            detail=f"Index for case {req.case_id} not found"
        )

    try:
        response = search_events(
            client=client,
            index_name=index_name,
            query=req.query,
            filters=req.filters,
            field_filters=[f.model_dump(exclude_none=True) for f in req.field_filters],
            time_range=req.time_range,
            from_=req.from_,
            size=req.size,
            sort_by=req.sort_by,
            sort_order=req.sort_order
        )

        return SearchResponse(
            hits=[hit["_source"] for hit in response["hits"]["hits"]],
            total=response["hits"]["total"]["value"],
            took=response["took"],
            from_=req.from_,
            size=req.size
        )

    except Exception as e:
        logger.error(f"Search failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Search failed: {str(e)}"
        )


@router.post("/aggregate", response_model=AggregationResponse)
def aggregate_case_field(
    req: AggregationRequest,
    client=Depends(get_opensearch_client_dep),
    current_user: User = Depends(get_current_active_user)
):
    """
    Agrégation terms sur un champ.

    Retourne les N valeurs les plus fréquentes d'un champ.

    Example fields:
    - `source.parser` - Top parsers
    - `event.type` - Top event types
    - `file.extension` - Top file extensions
    - `user.name` - Top users
    """
    index_name = get_index_name(req.case_id)

    if not client.indices.exists(index=index_name):
        raise HTTPException(
            status_code=404,
            detail=f"Index for case {req.case_id} not found"
        )

    try:
        query = build_bool_query(
            query=req.query,
            filters=req.filters,
            field_filters=[f.model_dump(exclude_none=True) for f in req.field_filters],
            time_range=req.time_range,
        )
        agg_result = aggregate_field(
            client=client,
            index_name=index_name,
            field=req.field,
            size=req.size,
            query=query
        )

        buckets = [
            AggregationBucket(key=str(b["key"]), count=b["doc_count"])
            for b in agg_result["buckets"]
        ]

        total = sum(b.count for b in buckets)

        return AggregationResponse(
            field=req.field,
            buckets=buckets,
            total=total
        )

    except Exception as e:
        logger.error(f"Aggregation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Aggregation failed: {str(e)}"
        )


@router.post("/timeline", response_model=TimelineResponse)
def get_case_timeline(
    req: TimelineRequest,
    client=Depends(get_opensearch_client_dep),
    current_user: User = Depends(get_current_active_user)
):
    """
    Agrégation temporelle pour générer une timeline.

    Retourne le nombre d'événements par intervalle de temps. (Requires authentication)

    Intervals supportés:
    - `1m` - 1 minute
    - `5m` - 5 minutes
    - `1h` - 1 heure
    - `1d` - 1 jour
    """
    index_name = get_index_name(req.case_id)

    if not client.indices.exists(index=index_name):
        raise HTTPException(
            status_code=404,
            detail=f"Index for case {req.case_id} not found"
        )

    try:
        query = build_bool_query(
            query=req.query,
            filters=req.filters,
            field_filters=[f.model_dump(exclude_none=True) for f in req.field_filters],
            time_range=req.time_range,
        )
        timeline_result = timeline_aggregation(
            client=client,
            index_name=index_name,
            interval=req.interval,
            time_field=req.time_field,
            query=query
        )

        buckets = [
            TimelineBucket(
                timestamp=b["key_as_string"],
                count=b["doc_count"]
            )
            for b in timeline_result["buckets"]
        ]

        total = sum(b.count for b in buckets)

        return TimelineResponse(
            interval=req.interval,
            buckets=buckets,
            total=total
        )

    except Exception as e:
        logger.error(f"Timeline aggregation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Timeline aggregation failed: {str(e)}"
        )


@router.get("/stats/{case_id}", response_model=IndexStatsResponse)
def get_case_index_stats(
    case_id: str,
    client=Depends(get_opensearch_client_dep),
    current_user: User = Depends(get_current_active_user)
):
    """
    Récupère les statistiques de l'index d'un case. (Requires authentication)

    Retourne:
    - Nombre de documents
    - Taille de l'index
    - Configuration (shards, replicas)
    """
    index_name = get_index_name(case_id)

    if not client.indices.exists(index=index_name):
        raise HTTPException(
            status_code=404,
            detail=f"Index for case {case_id} not found"
        )

    try:
        doc_count = get_document_count(client, case_id)
        stats = get_index_stats(client, case_id)

        return IndexStatsResponse(
            case_id=case_id,
            index_name=index_name,
            document_count=doc_count,
            size_bytes=stats["total"]["store"]["size_in_bytes"],
            shard_count=stats["total"]["shards"]["total"],
            replica_count=0  # TODO: extraire depuis settings
        )

    except Exception as e:
        logger.error(f"Stats retrieval failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Stats retrieval failed: {str(e)}"
        )


@router.get("/health")
def opensearch_health(
    client=Depends(get_opensearch_client_dep),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Vérifie la santé de la connexion OpenSearch.

    Retourne les informations du cluster.
    """
    try:
        info = client.info()
        cluster_health = client.cluster.health()

        return {
            "status": "ok",
            "opensearch_version": info["version"]["number"],
            "cluster_name": info["cluster_name"],
            "cluster_status": cluster_health["status"],
            "node_count": cluster_health["number_of_nodes"]
        }

    except Exception as e:
        logger.error(f"OpenSearch health check failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail=f"OpenSearch unavailable: {str(e)}"
        )
