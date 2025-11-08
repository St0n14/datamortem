"""
Authorization helpers for RBAC and per-case access control.
"""
from typing import Iterable, List
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..models import Case, Evidence, TaskRun, User


def is_admin_user(user: User) -> bool:
    """Return True if the user has administrative privileges."""
    return bool(user.is_superuser or user.role == "admin")


def ensure_case_access(case: Case | None, user: User) -> Case:
    """
    Ensure the current user can access the given case.

    Admins have access to everything. Non-admins must be the owner.
    """
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    if is_admin_user(user):
        return case

    if case.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden case access")

    return case


def ensure_case_access_by_id(case_id: str, user: User, db: Session) -> Case:
    """Fetch a case by id and ensure the user can access it."""
    case = db.query(Case).filter(Case.case_id == case_id).first()
    return ensure_case_access(case, user)


def ensure_evidence_access(evidence: Evidence | None, user: User) -> Evidence:
    """Ensure the user can access the evidence via its parent case."""
    if evidence is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence not found")

    ensure_case_access(evidence.case, user)
    return evidence


def ensure_evidence_access_by_uid(evidence_uid: str, user: User, db: Session) -> Evidence:
    """Fetch an evidence by uid and ensure access."""
    evidence = db.query(Evidence).filter(Evidence.evidence_uid == evidence_uid).first()
    return ensure_evidence_access(evidence, user)


def ensure_task_run_access(task_run: TaskRun | None, user: User) -> TaskRun:
    """Ensure the user can access a task run via its evidence."""
    if task_run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TaskRun not found")

    ensure_evidence_access(task_run.evidence, user)
    return task_run


def get_accessible_case_ids(db: Session, user: User) -> List[str]:
    """
    Return the list of case_ids the current user can access.

    Admins see all cases; others only the ones they own.
    """
    if is_admin_user(user):
        return [case.case_id for case in db.query(Case.case_id).all()]

    return [
        case.case_id
        for case in db.query(Case.case_id).filter(Case.owner_id == user.id).all()
    ]


def restrict_query_to_cases(query, case_ids: Iterable[str]):
    """
    Helper to add a case filter to SQLAlchemy queries when the list of ids is finite.
    """
    case_ids = list(case_ids)
    if not case_ids:
        return query.filter(False)
    return query.filter(Case.case_id.in_(case_ids))
