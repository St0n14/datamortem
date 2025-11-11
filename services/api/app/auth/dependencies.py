"""
Authentication dependencies for FastAPI route protection.
"""
from typing import Optional
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..config import settings
from .security import decode_access_token
from .permissions import is_admin_user, is_superadmin_user

# Cache simple en mémoire pour les utilisateurs authentifiés
# Structure: {token_hash: (user, expires_at)}
_user_cache: dict[str, tuple[User, datetime]] = {}
_cache_ttl_seconds = 60  # Cache valide pendant 60 secondes


# HTTP Bearer token security scheme
security = HTTPBearer()


def _get_cache_key(token: str) -> str:
    """Génère une clé de cache à partir du token (hash simple)."""
    return str(hash(token))


def _clean_expired_cache():
    """Nettoie les entrées expirées du cache."""
    now = datetime.utcnow()
    expired_keys = [
        key for key, (_, expires_at) in _user_cache.items()
        if expires_at < now
    ]
    for key in expired_keys:
        _user_cache.pop(key, None)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Get the current authenticated user from JWT token.
    Utilise un cache en mémoire pour éviter les requêtes DB répétées.

    Args:
        credentials: Bearer token from Authorization header
        db: Database session

    Returns:
        User model instance

    Raises:
        HTTPException: If token is invalid or user not found
    """
    token = credentials.credentials

    # Nettoyer le cache expiré périodiquement
    _clean_expired_cache()

    # Vérifier le cache
    cache_key = _get_cache_key(token)
    cached = _user_cache.get(cache_key)
    if cached:
        user, expires_at = cached
        if expires_at > datetime.utcnow():
            return user
        else:
            # Cache expiré, on le supprime
            _user_cache.pop(cache_key, None)

    # Decode token
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract user_id from token (sub is a string in JWT)
    user_id_str: str = payload.get("sub")
    if user_id_str is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Fetch user from database
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    if settings.dm_enable_email_verification and not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email address is not verified"
        )

    # Mettre en cache
    # Note: l'objet User reste attaché à la session, mais c'est OK car
    # on le réutilise rapidement. Pour un cache plus robuste, on pourrait
    # utiliser expunge() mais cela nécessiterait de recharger depuis la DB.
    expires_at = datetime.utcnow() + timedelta(seconds=_cache_ttl_seconds)
    _user_cache[cache_key] = (user, expires_at)
    
    # Limiter la taille du cache pour éviter une consommation mémoire excessive
    if len(_user_cache) > 1000:
        # Supprimer les 100 entrées les plus anciennes
        sorted_items = sorted(_user_cache.items(), key=lambda x: x[1][1])
        for key, _ in sorted_items[:100]:
            _user_cache.pop(key, None)

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Get the current active user (convenience wrapper).

    Args:
        current_user: Current user from get_current_user dependency

    Returns:
        User model instance
    """
    return current_user


async def get_current_admin_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Get the current user and verify they have admin role.

    Args:
        current_user: Current user from get_current_user dependency

    Returns:
        User model instance

    Raises:
        HTTPException: If user is not an admin
    """
    if not is_admin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions (admin required)"
        )
    return current_user


async def get_current_superadmin_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Get the current user and verify they are superadmin (full system access).
    """
    if not is_superadmin_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions (superadmin required)"
        )
    return current_user


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Get the current user if authenticated, otherwise return None.
    Useful for routes that work with or without authentication.

    Args:
        credentials: Optional bearer token
        db: Database session

    Returns:
        User model instance or None
    """
    if credentials is None:
        return None

    token = credentials.credentials
    payload = decode_access_token(token)
    if payload is None:
        return None

    user_id_str: str = payload.get("sub")
    if user_id_str is None:
        return None

    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        return None

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        return None

    if settings.dm_enable_email_verification and not user.email_verified:
        return None

    return user
