"""
Role definitions and helpers for the Requiem RBAC system.
"""
from __future__ import annotations

from typing import Literal, Sequence


RoleName = Literal["superadmin", "admin", "analyst", "viewer"]

ROLE_SUPERADMIN: RoleName = "superadmin"
ROLE_ADMIN: RoleName = "admin"
ROLE_ANALYST: RoleName = "analyst"
ROLE_VIEWER: RoleName = "viewer"

VALID_ROLES: tuple[RoleName, ...] = (
    ROLE_SUPERADMIN,
    ROLE_ADMIN,
    ROLE_ANALYST,
    ROLE_VIEWER,
)

ADMIN_ROLES: frozenset[str] = frozenset({ROLE_SUPERADMIN, ROLE_ADMIN})
WRITER_ROLES: frozenset[str] = frozenset({ROLE_SUPERADMIN, ROLE_ADMIN, ROLE_ANALYST})


def is_role(value: str, roles: Sequence[str]) -> bool:
    """Return True if the provided value matches one of the allowed roles."""
    return value in roles
