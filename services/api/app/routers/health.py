"""
Health check endpoints for system services
"""
import os
import shutil
import time
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from app.auth.dependencies import get_current_active_user
from app.models import User
from app.db import SessionLocal
from sqlalchemy import text
import redis

from app.config import settings
from app.celery_app import celery_app, is_eager_mode
from app.opensearch.client import get_opensearch_client

router = APIRouter(prefix="/health", tags=["health"])


def check_postgres_detailed() -> Dict[str, Any]:
    """Check PostgreSQL database connection with detailed metrics"""
    result: Dict[str, Any] = {
        "status": "unknown",
        "connected": False,
        "version": None,
        "database_size_mb": None,
        "active_connections": None,
        "max_connections": None,
        "connection_usage_percent": None,
        "response_time_ms": None,
        "error": None,
    }
    
    start_time = time.time()
    try:
        db = SessionLocal()
        
        # Basic connection test
        db.execute(text("SELECT 1"))
        result["connected"] = True
        
        # Get PostgreSQL version
        version_result = db.execute(text("SELECT version()")).fetchone()
        if version_result:
            version_str = version_result[0]
            # Extract version number (e.g., "PostgreSQL 16.1" -> "16.1")
            if "PostgreSQL" in version_str:
                parts = version_str.split()
                if len(parts) > 1:
                    result["version"] = parts[1]
        
        # Get database size (PostgreSQL only)
        if "postgresql" in settings.dm_db_url.lower():
            size_result = db.execute(
                text("SELECT pg_size_pretty(pg_database_size(current_database())) as size")
            ).fetchone()
            if size_result:
                size_str = size_result[0]
                # Convert to MB
                if "MB" in size_str:
                    result["database_size_mb"] = float(size_str.replace(" MB", ""))
                elif "GB" in size_str:
                    result["database_size_mb"] = float(size_str.replace(" GB", "")) * 1024
                elif "KB" in size_str:
                    result["database_size_mb"] = float(size_str.replace(" KB", "")) / 1024
            
            # Get connection stats
            conn_result = db.execute(
                text("""
                    SELECT 
                        count(*) as active,
                        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max
                    FROM pg_stat_activity 
                    WHERE datname = current_database()
                """)
            ).fetchone()
            if conn_result:
                result["active_connections"] = conn_result[0]
                result["max_connections"] = conn_result[1]
                if conn_result[1] > 0:
                    result["connection_usage_percent"] = round(
                        (conn_result[0] / conn_result[1]) * 100, 2
                    )
        
        db.close()
        result["status"] = "healthy"
        result["response_time_ms"] = round((time.time() - start_time) * 1000, 2)
        
    except Exception as e:
        result["status"] = "unhealthy"
        result["error"] = str(e)
        result["response_time_ms"] = round((time.time() - start_time) * 1000, 2)
    
    return result


def check_postgres() -> dict:
    """Check PostgreSQL database connection (simple)"""
    detailed = check_postgres_detailed()
    return {
        "status": detailed["status"],
        "message": "Connected" if detailed["connected"] else detailed.get("error", "Unknown error")
    }


def check_redis_detailed() -> Dict[str, Any]:
    """Check Redis connection with detailed metrics"""
    result: Dict[str, Any] = {
        "status": "unknown",
        "connected": False,
        "version": None,
        "used_memory_mb": None,
        "used_memory_peak_mb": None,
        "max_memory_mb": None,
        "memory_usage_percent": None,
        "connected_clients": None,
        "total_keys": None,
        "response_time_ms": None,
        "error": None,
    }
    
    broker_url = settings.dm_celery_broker
    if broker_url.startswith("memory://"):
        result["status"] = "degraded"
        result["error"] = "Broker in memory mode (not suitable for production)"
        return result
    
    start_time = time.time()
    try:
        redis_client = redis.Redis.from_url(broker_url, socket_connect_timeout=2, decode_responses=True)
        redis_client.ping()
        result["connected"] = True
        
        # Get Redis info
        info = redis_client.info()
        
        # Version
        if "redis_version" in info:
            result["version"] = info["redis_version"]
        
        # Memory stats
        if "used_memory" in info:
            result["used_memory_mb"] = round(info["used_memory"] / (1024 * 1024), 2)
        if "used_memory_peak" in info:
            result["used_memory_peak_mb"] = round(info["used_memory_peak"] / (1024 * 1024), 2)
        if "maxmemory" in info and info["maxmemory"] > 0:
            result["max_memory_mb"] = round(info["maxmemory"] / (1024 * 1024), 2)
            if result["used_memory_mb"]:
                result["memory_usage_percent"] = round(
                    (result["used_memory_mb"] / result["max_memory_mb"]) * 100, 2
                )
        
        # Connection stats
        if "connected_clients" in info:
            result["connected_clients"] = info["connected_clients"]
        
        # Key count (approximate)
        try:
            result["total_keys"] = redis_client.dbsize()
        except:
            pass
        
        result["status"] = "healthy"
        result["response_time_ms"] = round((time.time() - start_time) * 1000, 2)
        
    except Exception as e:
        result["status"] = "unhealthy"
        result["error"] = str(e)
        result["response_time_ms"] = round((time.time() - start_time) * 1000, 2)
    
    return result


def check_redis() -> dict:
    """Check Redis connection (simple)"""
    detailed = check_redis_detailed()
    if detailed["connected"]:
        return {"status": detailed["status"], "message": "Connected"}
    else:
        return {"status": detailed["status"], "message": detailed.get("error", "Unknown error")}


def check_celery_detailed() -> Dict[str, Any]:
    """Check Celery worker status with detailed metrics"""
    result: Dict[str, Any] = {
        "status": "unknown",
        "eager_mode": False,
        "workers_active": 0,
        "workers_registered": [],
        "total_tasks_processed": None,
        "active_tasks": None,
        "reserved_tasks": None,
        "scheduled_tasks": None,
        "response_time_ms": None,
        "error": None,
    }
    
    start_time = time.time()
    
    if is_eager_mode:
        result["status"] = "healthy"
        result["eager_mode"] = True
        result["error"] = "Running in eager mode (tasks execute synchronously)"
        result["response_time_ms"] = round((time.time() - start_time) * 1000, 2)
        return result
    
    try:
        inspect = celery_app.control.inspect(timeout=1.0)  # Réduit de 2.0 à 1.0 pour accélérer
        if not inspect:
            result["status"] = "unhealthy"
            result["error"] = "No workers responded"
            result["response_time_ms"] = round((time.time() - start_time) * 1000, 2)
            return result
        
        # Get worker stats
        stats = inspect.stats()
        if stats:
            result["workers_active"] = len(stats)
            result["workers_registered"] = list(stats.keys())
            
            # Aggregate task stats
            total_processed = 0
            for worker_stats in stats.values():
                if "total" in worker_stats:
                    total_processed += worker_stats["total"].get("tasks.succeeded", 0)
            
            result["total_tasks_processed"] = total_processed
        
        # Get active tasks
        active = inspect.active()
        if active:
            total_active = sum(len(tasks) for tasks in active.values())
            result["active_tasks"] = total_active
        
        # Get reserved tasks
        reserved = inspect.reserved()
        if reserved:
            total_reserved = sum(len(tasks) for tasks in reserved.values())
            result["reserved_tasks"] = total_reserved
        
        # Get scheduled tasks
        scheduled = inspect.scheduled()
        if scheduled:
            total_scheduled = sum(len(tasks) for tasks in scheduled.values())
            result["scheduled_tasks"] = total_scheduled
        
        if result["workers_active"] > 0:
            result["status"] = "healthy"
        else:
            result["status"] = "unhealthy"
            result["error"] = "No active workers"
        
        result["response_time_ms"] = round((time.time() - start_time) * 1000, 2)
        
    except Exception as e:
        result["status"] = "unhealthy"
        result["error"] = str(e)
        result["response_time_ms"] = round((time.time() - start_time) * 1000, 2)
    
    return result


def check_celery() -> dict:
    """Check Celery worker status (simple)"""
    detailed = check_celery_detailed()
    if detailed["eager_mode"]:
        return {"status": detailed["status"], "message": "Running in eager mode"}
    elif detailed["workers_active"] > 0:
        return {"status": detailed["status"], "message": f"{detailed['workers_active']} worker(s) active"}
    else:
        return {"status": detailed["status"], "message": detailed.get("error", "No workers available")}


def check_opensearch_detailed() -> Dict[str, Any]:
    """Check OpenSearch connection with detailed metrics"""
    result: Dict[str, Any] = {
        "status": "unknown",
        "connected": False,
        "cluster_name": None,
        "cluster_status": None,
        "version": None,
        "number_of_nodes": None,
        "number_of_data_nodes": None,
        "active_primary_shards": None,
        "active_shards": None,
        "relocating_shards": None,
        "initializing_shards": None,
        "unassigned_shards": None,
        "total_indices": None,
        "total_documents": None,
        "total_size_mb": None,
        "response_time_ms": None,
        "error": None,
    }
    
    start_time = time.time()
    try:
        client = get_opensearch_client(settings)
        
        # Cluster health
        health = client.cluster.health()
        result["connected"] = True
        result["cluster_name"] = health.get("cluster_name")
        result["cluster_status"] = health.get("status", "unknown")
        result["number_of_nodes"] = health.get("number_of_nodes")
        result["number_of_data_nodes"] = health.get("number_of_data_nodes")
        result["active_primary_shards"] = health.get("active_primary_shards")
        result["active_shards"] = health.get("active_shards")
        result["relocating_shards"] = health.get("relocating_shards", 0)
        result["initializing_shards"] = health.get("initializing_shards", 0)
        result["unassigned_shards"] = health.get("unassigned_shards", 0)
        
        # Cluster info for version
        info = client.info()
        if "version" in info:
            result["version"] = info["version"].get("number")
        
        # Cluster stats
        stats = client.cluster.stats()
        if "indices" in stats:
            indices_stats = stats["indices"]
            result["total_indices"] = indices_stats.get("count", 0)
            result["total_documents"] = indices_stats.get("docs", {}).get("count", 0)
            store = indices_stats.get("store", {})
            if "size_in_bytes" in store:
                result["total_size_mb"] = round(store["size_in_bytes"] / (1024 * 1024), 2)
        
        # Determine overall status
        cluster_status = result["cluster_status"]
        if cluster_status == "green":
            result["status"] = "healthy"
        elif cluster_status == "yellow":
            result["status"] = "degraded"
        elif cluster_status == "red":
            result["status"] = "unhealthy"
        else:
            result["status"] = "unknown"
        
        result["response_time_ms"] = round((time.time() - start_time) * 1000, 2)
        
    except Exception as e:
        result["status"] = "unhealthy"
        result["error"] = str(e)
        result["response_time_ms"] = round((time.time() - start_time) * 1000, 2)
    
    return result


def check_opensearch() -> dict:
    """Check OpenSearch connection (simple) - version optimisée pour /status"""
    result: Dict[str, Any] = {
        "status": "unknown",
        "message": "Unknown error"
    }
    
    start_time = time.time()
    try:
        client = get_opensearch_client(settings)
        # Seulement cluster.health() pour la version simple (plus rapide)
        # Le timeout du client (30s) est utilisé pour la connexion HTTP
        health = client.cluster.health()
        cluster_status = health.get("status", "unknown")
        
        if cluster_status == "green":
            result["status"] = "healthy"
        elif cluster_status == "yellow":
            result["status"] = "degraded"
        elif cluster_status == "red":
            result["status"] = "unhealthy"
        else:
            result["status"] = "unknown"
        
        result["message"] = f"Cluster: {cluster_status}"
        
    except Exception as e:
        result["status"] = "unhealthy"
        result["message"] = str(e)
    
    return result


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


def check_disk_space() -> Dict[str, Any]:
    """Check disk space for storage directory"""
    result: Dict[str, Any] = {
        "status": "unknown",
        "path": settings.dm_lake_root,
        "total_gb": None,
        "used_gb": None,
        "free_gb": None,
        "usage_percent": None,
        "error": None,
    }
    
    try:
        if not os.path.exists(settings.dm_lake_root):
            result["status"] = "degraded"
            result["error"] = f"Storage path does not exist: {settings.dm_lake_root}"
            return result
        
        stat = shutil.disk_usage(settings.dm_lake_root)
        result["total_gb"] = round(stat.total / (1024 ** 3), 2)
        result["used_gb"] = round(stat.used / (1024 ** 3), 2)
        result["free_gb"] = round(stat.free / (1024 ** 3), 2)
        
        if result["total_gb"] > 0:
            result["usage_percent"] = round((result["used_gb"] / result["total_gb"]) * 100, 2)
        
        # Determine status based on usage
        if result["usage_percent"] is not None:
            if result["usage_percent"] > 90:
                result["status"] = "unhealthy"
            elif result["usage_percent"] > 80:
                result["status"] = "degraded"
            else:
                result["status"] = "healthy"
        else:
            result["status"] = "healthy"
        
    except Exception as e:
        result["status"] = "unhealthy"
        result["error"] = str(e)
    
    return result


def check_rate_limiting() -> Dict[str, Any]:
    """Check rate limiting status"""
    result: Dict[str, Any] = {
        "status": "unknown",
        "enabled": settings.dm_rate_limit_enabled,
        "redis_available": False,
        "backend": None,
        "error": None,
    }
    
    if not settings.dm_rate_limit_enabled:
        result["status"] = "degraded"
        result["error"] = "Rate limiting is disabled"
        return result
    
    try:
        broker_url = settings.dm_celery_broker
        if broker_url.startswith("redis://"):
            redis_client = redis.Redis.from_url(broker_url, socket_connect_timeout=2)
            redis_client.ping()
            result["redis_available"] = True
            result["backend"] = "Redis"
            result["status"] = "healthy"
        else:
            result["backend"] = "In-memory"
            result["status"] = "degraded"
            result["error"] = "Using in-memory backend (not suitable for production)"
    except Exception as e:
        result["status"] = "unhealthy"
        result["backend"] = "In-memory (fallback)"
        result["error"] = f"Redis unavailable: {str(e)}"
    
    return result


def check_hedgedoc() -> Dict[str, Any]:
    """Check HedgeDoc integration status"""
    result: Dict[str, Any] = {
        "status": "unknown",
        "enabled": settings.dm_hedgedoc_enabled,
        "base_url": settings.dm_hedgedoc_base_url,
        "public_url": settings.dm_hedgedoc_public_url,
        "reachable": False,
        "response_time_ms": None,
        "error": None,
    }
    
    if not settings.dm_hedgedoc_enabled:
        result["status"] = "disabled"
        return result
    
    if not settings.dm_hedgedoc_base_url:
        result["status"] = "degraded"
        result["error"] = "HedgeDoc base URL not configured"
        return result
    
    try:
        import requests
        start_time = time.time()
        response = requests.get(
            f"{settings.dm_hedgedoc_base_url}/status",
            timeout=2
        )
        result["reachable"] = response.status_code == 200
        result["response_time_ms"] = round((time.time() - start_time) * 1000, 2)
        result["status"] = "healthy" if result["reachable"] else "degraded"
    except ImportError:
        result["status"] = "unknown"
        result["error"] = "requests library not available for health check"
    except Exception as e:
        result["status"] = "degraded"
        result["error"] = str(e)
    
    return result


@router.get("/status")
async def get_system_status(current_user: User = Depends(get_current_active_user)):
    """
    Get status of all system services (simple)
    Requires authentication
    Optimisé pour être rapide - vérifications en parallèle
    """
    # Exécuter les vérifications en parallèle pour réduire le temps total
    loop = asyncio.get_event_loop()
    executor = ThreadPoolExecutor(max_workers=4)
    
    try:
        # Exécuter toutes les vérifications en parallèle
        postgres_future = loop.run_in_executor(executor, check_postgres)
        redis_future = loop.run_in_executor(executor, check_redis)
        celery_future = loop.run_in_executor(executor, check_celery)
        opensearch_future = loop.run_in_executor(executor, check_opensearch)
        
        # Attendre toutes les vérifications en parallèle
        postgres, redis_check, celery, opensearch = await asyncio.gather(
            postgres_future,
            redis_future,
            celery_future,
            opensearch_future,
            return_exceptions=True
        )
        
        # Gérer les exceptions
        if isinstance(postgres, Exception):
            postgres = {"status": "unhealthy", "message": str(postgres)}
        if isinstance(redis_check, Exception):
            redis_check = {"status": "unhealthy", "message": str(redis_check)}
        if isinstance(celery, Exception):
            celery = {"status": "unhealthy", "message": str(celery)}
        if isinstance(opensearch, Exception):
            opensearch = {"status": "unhealthy", "message": str(opensearch)}
        
        return {
            "api": {"status": "healthy", "message": "Running"},
            "postgres": postgres,
            "redis": redis_check,
            "celery": celery,
            "opensearch": opensearch,
        }
    finally:
        executor.shutdown(wait=False)


@router.get("/detailed")
async def get_detailed_health(current_user: User = Depends(get_current_active_user)):
    """
    Get detailed health status of all system services with metrics.
    Requires authentication.
    
    Returns comprehensive information about:
    - PostgreSQL: connection, version, size, connection pool
    - Redis: connection, memory usage, keys
    - OpenSearch: cluster health, indices, documents
    - Celery: workers, tasks
    - Disk space: storage usage
    - Rate limiting: backend status
    - HedgeDoc: integration status (if enabled)
    """
    overall_status = "healthy"
    
    # Check all services
    postgres = check_postgres_detailed()
    redis_check = check_redis_detailed()
    opensearch = check_opensearch_detailed()
    celery = check_celery_detailed()
    disk = check_disk_space()
    rate_limit = check_rate_limiting()
    hedgedoc = check_hedgedoc()
    
    # Determine overall status
    services = [postgres, redis_check, opensearch, celery, disk]
    for service in services:
        if service.get("status") == "unhealthy":
            overall_status = "unhealthy"
            break
        elif service.get("status") == "degraded" and overall_status == "healthy":
            overall_status = "degraded"
    
    return {
        "overall_status": overall_status,
        "timestamp": time.time(),
        "environment": settings.dm_env,
        "services": {
            "postgres": postgres,
            "redis": redis_check,
            "opensearch": opensearch,
            "celery": celery,
            "disk": disk,
            "rate_limiting": rate_limit,
            "hedgedoc": hedgedoc,
        },
    }


@router.get("/ready")
async def readiness_check():
    """
    Kubernetes-style readiness probe.
    Returns 200 if all critical services are healthy, 503 otherwise.
    Public endpoint (no auth required).
    """
    postgres = check_postgres_detailed()
    redis_check = check_redis_detailed()
    
    # Critical services must be healthy
    if postgres.get("status") != "healthy" or redis_check.get("status") not in ["healthy", "degraded"]:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service not ready"
        )
    
    return {"status": "ready"}


@router.get("/live")
async def liveness_check():
    """
    Kubernetes-style liveness probe.
    Returns 200 if API is running.
    Public endpoint (no auth required).
    """
    return {"status": "alive"}
