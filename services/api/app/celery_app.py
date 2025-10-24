from celery import Celery
from .config import settings

broker_url = settings.REDIS_URL or "memory://"
backend_url = settings.REDIS_URL or "rpc://"

celery_app = Celery(
    "datamortem",
    broker=broker_url,
    backend=backend_url,
)

celery_app.conf.task_routes = {
    "parse_mft_task": {"queue": "extract"},
    "parse_registry_task": {"queue": "extract"},
    "parse_users_task": {"queue": "extract"},
}
