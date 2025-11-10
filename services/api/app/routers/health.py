"""
Health check endpoints for system services
"""
from fastapi import APIRouter, Depends
from app.auth.dependencies import get_current_active_user
from app.models import User
from app.db import SessionLocal
from sqlalchemy import text
import redis

from app.config import settings
from app.celery_app import celery_app, is_eager_mode
from app.opensearch.client import get_opensearch_client

router = APIRouter(prefix="/health", tags=["health"])


def check_postgres() -> dict:
    """Check PostgreSQL database connection"""
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return {"status": "healthy", "message": "Connected"}
    except Exception as e:
        return {"status": "unhealthy", "message": str(e)}


def check_redis() -> dict:
    """Check Redis connection"""
    broker_url = settings.dm_celery_broker
    if broker_url.startswith("memory://"):
        return {"status": "degraded", "message": "Broker in memory mode"}

    try:
        redis_client = redis.Redis.from_url(broker_url, socket_connect_timeout=2)
        redis_client.ping()
        return {"status": "healthy", "message": "Connected"}
    except Exception as e:
        return {"status": "unhealthy", "message": str(e)}


def check_celery() -> dict:
    """Check Celery worker status"""
    if is_eager_mode:
        return {"status": "healthy", "message": "Running in eager mode"}

    try:
        inspect = celery_app.control.inspect(timeout=2.0)
        if not inspect:
            return {"status": "unhealthy", "message": "No workers responded"}

        stats = inspect.stats()
        if stats:
            worker_count = len(stats)
            return {"status": "healthy", "message": f"{worker_count} worker(s) active"}

        return {"status": "unhealthy", "message": "No worker stats available"}
    except Exception as e:
        return {"status": "unhealthy", "message": str(e)}


def check_opensearch() -> dict:
    """Check OpenSearch connection"""
    try:
        client = get_opensearch_client(settings)
        health = client.cluster.health()
        status = health.get("status", "unknown")

        if status == "green":
            return {"status": "healthy", "message": f"Cluster: {status}"}
        elif status == "yellow":
            return {"status": "degraded", "message": f"Cluster: {status}"}
        else:
            return {"status": "unhealthy", "message": f"Cluster: {status}"}
    except Exception as e:
        return {"status": "unhealthy", "message": str(e)}


@router.get("")
async def health_check():
    """
    Simple health check endpoint (public)
    Returns basic API status
    """
    return {
        "status": "healthy",
        "service": "datamortem-api",
        "message": "API is running"
    }


@router.get("/status")
async def get_system_status(current_user: User = Depends(get_current_active_user)):
    """
    Get status of all system services
    Requires authentication
    """
    return {
        "api": {"status": "healthy", "message": "Running"},
        "postgres": check_postgres(),
        "redis": check_redis(),
        "celery": check_celery(),
        "opensearch": check_opensearch(),
    }
