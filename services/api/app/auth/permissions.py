"""
Authorization helpers for RBAC and per-case access control.
"""
from typing import Iterable, List
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..models import Case, Evidence, TaskRun, User, CaseMember
from .roles import (
    ROLE_SUPERADMIN,
    ROLE_ADMIN,
    ROLE_ANALYST,
)


def is_superadmin_user(user: User) -> bool:
    """Return True if the user can perform full system management actions."""
    return bool(user.is_superuser or user.role == ROLE_SUPERADMIN)


def is_admin_user(user: User) -> bool:
    """Return True if the user has advanced data-access permissions."""
    return bool(is_superadmin_user(user) or user.role == ROLE_ADMIN)


def has_write_permissions(user: User) -> bool:
    """Return True if the user can create/update/delete cases, evidences, or run jobs."""
    if is_superadmin_user(user) or user.role in (ROLE_ADMIN, ROLE_ANALYST):
        return True
    return False


def ensure_has_write_permissions(user: User):
    """Ensure the user is not read-only."""
    if not has_write_permissions(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation requires write permissions",
        )


def ensure_case_access(case: Case | None, user: User, db: Session | None = None) -> Case:
    """
    Ensure the current user can access the given case.
    
    Logique d'accès :
    - Tous les utilisateurs (y compris superadmin et admin) ne peuvent accéder qu'à :
      1. Leurs propres cases (owner_id == user.id)
      2. Les cases où ils sont membres (via CaseMember)
    """
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    # Vérifier si l'utilisateur est le propriétaire
    if case.owner_id == user.id:
        return case
    
    # Vérifier si l'utilisateur est membre du case (partagé)
    if db is not None:
        is_member = db.query(CaseMember).filter(
            CaseMember.case_id == case.case_id,
            CaseMember.user_id == user.id
        ).first()
        if is_member:
            return case
    
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden case access")


def ensure_case_access_by_id(case_id: str, user: User, db: Session) -> Case:
    """Fetch a case by id and ensure the user can access it."""
    case = db.query(Case).filter(Case.case_id == case_id).first()
    return ensure_case_access(case, user, db)


def ensure_evidence_access(evidence: Evidence | None, user: User, db: Session | None = None) -> Evidence:
    """Ensure the user can access the evidence via its parent case."""
    if evidence is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence not found")

    ensure_case_access(evidence.case, user, db)
    return evidence


def ensure_evidence_access_by_uid(evidence_uid: str, user: User, db: Session) -> Evidence:
    """Fetch an evidence by uid and ensure access."""
    evidence = db.query(Evidence).filter(Evidence.evidence_uid == evidence_uid).first()
    return ensure_evidence_access(evidence, user, db)


def ensure_task_run_access(task_run: TaskRun | None, user: User, db: Session | None = None) -> TaskRun:
    """Ensure the user can access a task run via its evidence."""
    if task_run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TaskRun not found")

    ensure_evidence_access(task_run.evidence, user, db)
    return task_run


def get_accessible_case_ids(db: Session, user: User) -> List[str]:
    """
    Return the list of case_ids the current user can access.
    
    Logique d'accès :
    - Tous les utilisateurs (y compris superadmin et admin) ne voient que :
      1. Leurs propres cases (owner_id == user.id)
      2. Les cases où ils sont membres (via CaseMember)
    """
    # Cases possédées
    owned_cases = db.query(Case).filter(Case.owner_id == user.id).all()
    owned_case_ids = [case.case_id for case in owned_cases]
    
    # Cases où l'utilisateur est membre
    member_relations = db.query(CaseMember).filter(
        CaseMember.user_id == user.id
    ).all()
    member_case_ids = [member.case_id for member in member_relations]
    
    # Combiner et dédupliquer
    all_case_ids = set(owned_case_ids) | set(member_case_ids)
    
    return list(all_case_ids)


def restrict_query_to_cases(query, case_ids: Iterable[str]):
    """
    Helper to add a case filter to SQLAlchemy queries when the list of ids is finite.
    """
    case_ids = list(case_ids)
    if not case_ids:
        return query.filter(False)
    return query.filter(Case.case_id.in_(case_ids))
