"""
Health check endpoints for system services
"""
from fastapi import APIRouter, Depends
from app.auth.dependencies import get_current_active_user
from app.models import User
from app.db import SessionLocal
from sqlalchemy import text
import redis
from celery import Celery
import os

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
    try:
        redis_host = os.getenv("REDIS_HOST", "localhost")
        redis_port = int(os.getenv("REDIS_PORT", "6379"))
        r = redis.Redis(host=redis_host, port=redis_port, socket_connect_timeout=2)
        r.ping()
        return {"status": "healthy", "message": "Connected"}
    except Exception as e:
        return {"status": "unhealthy", "message": str(e)}


def check_celery() -> dict:
    """Check Celery worker status"""
    try:
        celery_broker = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
        celery_app = Celery(broker=celery_broker)

        # Inspect active workers
        inspect = celery_app.control.inspect(timeout=2.0)
        active_workers = inspect.active()

        if active_workers:
            worker_count = len(active_workers)
            return {"status": "healthy", "message": f"{worker_count} worker(s) active"}
        else:
            return {"status": "unhealthy", "message": "No workers available"}
    except Exception as e:
        return {"status": "unhealthy", "message": str(e)}


def check_opensearch() -> dict:
    """Check OpenSearch connection"""
    try:
        from app.opensearch.client import get_opensearch_client
        client = get_opensearch_client()
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
