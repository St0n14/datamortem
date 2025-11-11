"""
Rate limiting middleware using slowapi with Redis backend.
"""
import logging
from typing import Optional
from fastapi import Request, HTTPException, status
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
import redis

from ..config import settings

logger = logging.getLogger(__name__)

# Redis connection pour rate limiting
_redis_client: Optional[redis.Redis] = None


def get_redis_storage_uri() -> Optional[str]:
    """
    Get Redis storage URI for rate limiting.
    Returns None if Redis is not available (will use in-memory).
    """
    global _redis_client
    
    if not settings.dm_rate_limit_enabled:
        return None
    
    try:
        # Try to parse Redis URL from Celery broker
        if settings.dm_celery_broker.startswith("redis://"):
            # Use the broker URL but with a different DB
            broker_url = settings.dm_celery_broker
            # Extract DB number and increment by 1
            if "/" in broker_url:
                base_url, db_str = broker_url.rsplit("/", 1)
                try:
                    db = int(db_str) + 1
                except ValueError:
                    db = 1
                storage_uri = f"{base_url}/{db}"
            else:
                storage_uri = f"{broker_url}/1"
            
            # Test connection
            if "@" in storage_uri:
                # Has auth: redis://user:pass@host:port/db
                parts = storage_uri.split("@")[1].split("/")
                host_port = parts[0]
            else:
                # No auth: redis://host:port/db
                parts = storage_uri.replace("redis://", "").split("/")
                host_port = parts[0]
            
            if ":" in host_port:
                host, port = host_port.split(":")
                port = int(port)
            else:
                host = host_port
                port = 6379
            
            # Test connection
            test_client = redis.Redis(
                host=host,
                port=port,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            test_client.ping()
            test_client.close()
            logger.info("Rate limiting using Redis backend")
            return storage_uri
    except Exception as e:
        logger.warning(f"Failed to connect to Redis for rate limiting: {e}. Using in-memory fallback.")
    
    return None


def get_limiter_key(request: Request) -> str:
    """
    Get rate limiting key based on request.
    Uses IP address by default, but can be extended to use user ID for authenticated requests.
    """
    # Try to get user ID from request state (set by auth middleware)
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return f"user:{user_id}"
    
    # Fallback to IP address
    return get_remote_address(request)


# Initialize limiter
limiter = Limiter(
    key_func=get_limiter_key,
    storage_uri=get_redis_storage_uri(),
    default_limits=[],  # No default limits, apply per-route
    headers_enabled=True,  # Include rate limit headers in response
)


def create_rate_limit_exceeded_handler():
    """Custom handler for rate limit exceeded errors."""
    async def handler(request: Request, exc: RateLimitExceeded):
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "detail": f"Rate limit exceeded: {exc.detail}",
                "retry_after": exc.retry_after if exc.retry_after else 60,
            },
            headers={"Retry-After": str(exc.retry_after) if exc.retry_after else "60"},
        )
    return handler


# Rate limit decorators for common use cases
def rate_limit_login():
    """Rate limit for login endpoint: 5 attempts per minute."""
    return limiter.limit(f"{settings.dm_rate_limit_login_per_minute}/minute")


def rate_limit_register():
    """Rate limit for register endpoint: 3 attempts per hour."""
    return limiter.limit(f"{settings.dm_rate_limit_register_per_hour}/hour")


def rate_limit_api():
    """Rate limit for general API endpoints: 100 requests per minute."""
    return limiter.limit(f"{settings.dm_rate_limit_api_per_minute}/minute")


def rate_limit_search():
    """Rate limit for search endpoints: 30 requests per minute."""
    return limiter.limit(f"{settings.dm_rate_limit_search_per_minute}/minute")

