from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.dependencies import get_current_admin_user
from ..db import get_db
from ..models import User, Case, Evidence, TaskRun
from .health import check_postgres, check_redis, check_celery, check_opensearch

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
def get_admin_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    now = datetime.utcnow()
    active_since = now - timedelta(minutes=15)

    total_users = db.query(func.count(User.id)).scalar() or 0
    active_users = (
        db.query(func.count(User.id))
        .filter(User.last_login_utc.isnot(None))
        .filter(User.last_login_utc >= active_since)
        .scalar()
        or 0
    )

    total_cases = db.query(func.count(Case.id)).scalar() or 0
    total_evidences = db.query(func.count(Evidence.id)).scalar() or 0

    total_task_runs = db.query(func.count(TaskRun.id)).scalar() or 0
    running_task_runs = (
        db.query(func.count(TaskRun.id))
        .filter(TaskRun.status == "running")
        .scalar()
        or 0
    )
    queued_task_runs = (
        db.query(func.count(TaskRun.id))
        .filter(TaskRun.status == "queued")
        .scalar()
        or 0
    )

    services = {
        "postgres": check_postgres(),
        "redis": check_redis(),
        "celery": check_celery(),
        "opensearch": check_opensearch(),
    }

    return {
        "users": {
            "total": total_users,
            "active_last_15m": active_users,
        },
        "cases": {
            "total": total_cases,
            "evidences": total_evidences,
        },
        "task_runs": {
            "total": total_task_runs,
            "running": running_task_runs,
            "queued": queued_task_runs,
        },
        "services": services,
        "generated_at": now.isoformat() + "Z",
    }
