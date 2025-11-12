"""
Feature flags management router (superadmin only).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime

from ..db import get_db
from ..models import FeatureFlag, User
from ..auth.dependencies import get_current_superadmin_user
from ..schemas.feature_flag_schemas import FeatureFlagResponse, FeatureFlagUpdate

router = APIRouter(prefix="/api/feature-flags", tags=["feature-flags"])


@router.get("", response_model=list[FeatureFlagResponse])
def list_feature_flags(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin_user),
):
    """
    List all feature flags (superadmin only).
    """
    flags = db.query(FeatureFlag).order_by(FeatureFlag.feature_key).all()
    return flags


@router.get("/public/{feature_key}")
def get_feature_flag_public(
    feature_key: str,
    db: Session = Depends(get_db),
):
    """
    Get the enabled status of a specific feature flag (public, no auth required).
    Returns only the enabled status for public access.
    Must be defined before /{feature_key} to avoid route conflicts.
    """
    flag = db.query(FeatureFlag).filter(FeatureFlag.feature_key == feature_key).first()
    if not flag:
        # Default to enabled if flag doesn't exist (fail-open)
        return {"feature_key": feature_key, "enabled": True}
    return {"feature_key": feature_key, "enabled": flag.enabled}


@router.get("/{feature_key}", response_model=FeatureFlagResponse)
def get_feature_flag(
    feature_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin_user),
):
    """
    Get a specific feature flag by key (superadmin only).
    """
    flag = db.query(FeatureFlag).filter(FeatureFlag.feature_key == feature_key).first()
    if not flag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Feature flag '{feature_key}' not found"
        )
    return flag


@router.put("/{feature_key}", response_model=FeatureFlagResponse)
def update_feature_flag(
    feature_key: str,
    update: FeatureFlagUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_superadmin_user),
):
    """
    Update a feature flag (superadmin only).
    """
    flag = db.query(FeatureFlag).filter(FeatureFlag.feature_key == feature_key).first()
    if not flag:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Feature flag '{feature_key}' not found"
        )
    
    flag.enabled = update.enabled
    flag.updated_at_utc = datetime.utcnow()
    flag.updated_by_id = current_user.id
    
    db.commit()
    db.refresh(flag)
    
    return flag


def is_feature_enabled(feature_key: str, db: Session) -> bool:
    """
    Helper function to check if a feature is enabled.
    Returns True by default if the flag doesn't exist (fail-open).
    """
    flag = db.query(FeatureFlag).filter(FeatureFlag.feature_key == feature_key).first()
    if not flag:
        return True  # Default to enabled if flag doesn't exist
    return flag.enabled

