"""
Pydantic schemas for OpenSearch API requests and responses.
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any, Literal


class FieldFilter(BaseModel):
    """Advanced filter definition for explorer-like queries."""

    field: str = Field(..., description="Field path (e.g., event.type)")
    operator: Literal[
        "equals",
        "not_equals",
        "contains",
        "prefix",
        "wildcard",
        "exists",
        "missing",
    ] = Field(
        default="equals",
        description="Filter operator",
    )
    value: Optional[Any] = Field(
        default=None,
        description="Value (ignored for exists/missing)",
    )


class SearchRequest(BaseModel):
    """Request schema for search endpoint."""

    query: str = Field(
        ...,
        description="Query string (supports OpenSearch query_string syntax)"
    )
    case_id: str = Field(
        ...,
        description="Case identifier"
    )
    from_: int = Field(
        default=0,
        ge=0,
        alias="from",
        description="Pagination offset"
    )
    size: int = Field(
        default=50,
        ge=1,
        le=1000,
        description="Number of results to return (max 1000)"
    )
    sort_by: str = Field(
        default="@timestamp",
        description="Field to sort by"
    )
    sort_order: str = Field(
        default="desc",
        pattern="^(asc|desc)$",
        description="Sort order (asc or desc)"
    )
    filters: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional term filters {field: value}"
    )
    field_filters: List[FieldFilter] = Field(
        default_factory=list,
        description="Advanced filters with operators"
    )
    time_range: Optional[Dict[str, str]] = Field(
        default=None,
        description="Time range filter {gte: '...', lte: '...'}"
    )

    class Config:
        populate_by_name = True


class SearchHit(BaseModel):
    """Single search result."""

    source: Dict[str, Any] = Field(
        ...,
        description="Document source"
    )
    score: Optional[float] = Field(
        default=None,
        description="Relevance score"
    )


class SearchResponse(BaseModel):
    """Response schema for search endpoint."""

    hits: List[Dict[str, Any]] = Field(
        ...,
        description="List of matching documents"
    )
    total: int = Field(
        ...,
        description="Total number of matches"
    )
    took: int = Field(
        ...,
        description="Search execution time in milliseconds"
    )
    from_: int = Field(
        ...,
        alias="from",
        description="Pagination offset used"
    )
    size: int = Field(
        ...,
        description="Number of results requested"
    )

    class Config:
        populate_by_name = True


class AggregationRequest(BaseModel):
    """Request schema for aggregation endpoint."""

    case_id: str = Field(
        ...,
        description="Case identifier"
    )
    field: str = Field(
        ...,
        description="Field to aggregate on"
    )
    size: int = Field(
        default=10,
        ge=1,
        le=100,
        description="Number of buckets to return (max 100)"
    )
    query: Optional[str] = Field(
        default=None,
        description="Optional query to filter results"
    )
    filters: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Simple filters {field: value}"
    )
    field_filters: List[FieldFilter] = Field(
        default_factory=list,
        description="Advanced filters with operators"
    )
    time_range: Optional[Dict[str, str]] = Field(
        default=None,
        description="Time range {gte, lte}"
    )


class AggregationBucket(BaseModel):
    """Single aggregation bucket."""

    key: str = Field(
        ...,
        description="Bucket key (field value)"
    )
    count: int = Field(
        ...,
        description="Document count in this bucket"
    )


class AggregationResponse(BaseModel):
    """Response schema for aggregation endpoint."""

    field: str = Field(
        ...,
        description="Field that was aggregated"
    )
    buckets: List[AggregationBucket] = Field(
        ...,
        description="List of aggregation buckets"
    )
    total: int = Field(
        ...,
        description="Total number of documents"
    )


class TimelineRequest(BaseModel):
    """Request schema for timeline aggregation."""

    case_id: str = Field(
        ...,
        description="Case identifier"
    )
    interval: str = Field(
        default="1h",
        pattern="^\\d+[smhd]$",
        description="Time interval (e.g., 1m, 1h, 1d)"
    )
    time_field: str = Field(
        default="@timestamp",
        description="Time field to aggregate on"
    )
    query: Optional[str] = Field(
        default=None,
        description="Optional query to filter results"
    )
    filters: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Simple filters {field: value}"
    )
    field_filters: List[FieldFilter] = Field(
        default_factory=list,
        description="Advanced filters with operators"
    )
    time_range: Optional[Dict[str, str]] = Field(
        default=None,
        description="Time range {gte, lte}"
    )


class TimelineBucket(BaseModel):
    """Single timeline bucket."""

    timestamp: str = Field(
        ...,
        description="Bucket timestamp (ISO format)"
    )
    count: int = Field(
        ...,
        description="Document count in this time bucket"
    )


class TimelineResponse(BaseModel):
    """Response schema for timeline endpoint."""

    interval: str = Field(
        ...,
        description="Time interval used"
    )
    buckets: List[TimelineBucket] = Field(
        ...,
        description="List of time buckets"
    )
    total: int = Field(
        ...,
        description="Total number of documents"
    )


class IndexStatsResponse(BaseModel):
    """Response schema for index statistics."""

    case_id: str = Field(
        ...,
        description="Case identifier"
    )
    index_name: str = Field(
        ...,
        description="OpenSearch index name"
    )
    document_count: int = Field(
        ...,
        description="Total number of documents"
    )
    size_bytes: int = Field(
        ...,
        description="Index size in bytes"
    )
    shard_count: int = Field(
        ...,
        description="Number of shards"
    )
    replica_count: int = Field(
        ...,
        description="Number of replicas"
    )
