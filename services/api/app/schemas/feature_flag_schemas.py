"""
Schemas for feature flags management.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class FeatureFlagResponse(BaseModel):
    """Feature flag response schema"""
    id: int
    feature_key: str
    enabled: bool
    description: Optional[str]
    updated_at_utc: datetime
    updated_by_id: Optional[int]

    class Config:
        from_attributes = True


class FeatureFlagUpdate(BaseModel):
    """Feature flag update schema"""
    enabled: bool

