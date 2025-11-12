"""
Tests unitaires pour app.auth.permissions
"""
import pytest
from fastapi import HTTPException

from app.models import User, Case, Evidence, TaskRun, CaseMember
from app.auth.permissions import (
    is_superadmin_user,
    is_admin_user,
    has_write_permissions,
    ensure_has_write_permissions,
    ensure_case_access,
    ensure_case_access_by_id,
    ensure_evidence_access,
    ensure_evidence_access_by_uid,
    ensure_task_run_access,
    get_accessible_case_ids,
    restrict_query_to_cases,
)


class TestRoleChecks:
    """Tests pour les vérifications de rôles."""
    
    def test_is_superadmin_user_with_superuser_flag(self, test_superadmin_user):
        """Test que is_superuser=True retourne True."""
        assert is_superadmin_user(test_superadmin_user) is True
    
    def test_is_superadmin_user_with_role(self, test_db):
        """Test que role='superadmin' retourne True."""
        user = User(
            email="super@example.com",
            username="super",
            hashed_password="hash",
            role="superadmin",
            is_superuser=False,
        )
        assert is_superadmin_user(user) is True
    
    def test_is_admin_user_includes_superadmin(self, test_superadmin_user):
        """Test que is_admin_user inclut les superadmins."""
        assert is_admin_user(test_superadmin_user) is True
    
    def test_is_admin_user_with_admin_role(self, test_admin_user):
        """Test que role='admin' retourne True pour is_admin_user."""
        assert is_admin_user(test_admin_user) is True
    
    def test_has_write_permissions_superadmin(self, test_superadmin_user):
        """Test que les superadmins ont les permissions d'écriture."""
        assert has_write_permissions(test_superadmin_user) is True
    
    def test_has_write_permissions_admin(self, test_admin_user):
        """Test que les admins ont les permissions d'écriture."""
        assert has_write_permissions(test_admin_user) is True
    
    def test_has_write_permissions_analyst(self, test_user):
        """Test que les analystes ont les permissions d'écriture."""
        assert has_write_permissions(test_user) is True
    
    def test_has_write_permissions_viewer(self, test_db):
        """Test que les viewers n'ont pas les permissions d'écriture."""
        user = User(
            email="viewer@example.com",
            username="viewer",
            hashed_password="hash",
            role="viewer",
        )
        assert has_write_permissions(user) is False
    
    def test_ensure_has_write_permissions_raises_for_viewer(self, test_db):
        """Test que ensure_has_write_permissions lève une exception pour les viewers."""
        user = User(
            email="viewer@example.com",
            username="viewer",
            hashed_password="hash",
            role="viewer",
        )
        with pytest.raises(HTTPException) as exc_info:
            ensure_has_write_permissions(user)
        assert exc_info.value.status_code == 403


class TestCaseAccess:
    """Tests pour l'accès aux cases."""
    
    def test_ensure_case_access_owner(self, test_user, test_case):
        """Test que le propriétaire peut accéder à son case."""
        result = ensure_case_access(test_case, test_user, None)
        assert result == test_case
    
    def test_ensure_case_access_member(self, test_db, test_user, test_case):
        """Test qu'un membre peut accéder au case partagé."""
        # Créer un autre utilisateur
        other_user = User(
            email="member@example.com",
            username="member",
            hashed_password="hash",
            role="analyst",
        )
        test_db.add(other_user)
        test_db.commit()
        test_db.refresh(other_user)
        
        # Ajouter l'utilisateur comme membre
        member = CaseMember(
            case_id=test_case.case_id,
            user_id=other_user.id,
        )
        test_db.add(member)
        test_db.commit()
        
        result = ensure_case_access(test_case, other_user, test_db)
        assert result == test_case
    
    def test_ensure_case_access_forbidden(self, test_db, test_case):
        """Test qu'un utilisateur non autorisé ne peut pas accéder."""
        other_user = User(
            email="other@example.com",
            username="other",
            hashed_password="hash",
            role="analyst",
        )
        test_db.add(other_user)
        test_db.commit()
        test_db.refresh(other_user)
        
        with pytest.raises(HTTPException) as exc_info:
            ensure_case_access(test_case, other_user, test_db)
        assert exc_info.value.status_code == 403
    
    def test_ensure_case_access_not_found(self, test_user):
        """Test qu'une exception est levée si le case n'existe pas."""
        with pytest.raises(HTTPException) as exc_info:
            ensure_case_access(None, test_user, None)
        assert exc_info.value.status_code == 404
    
    def test_ensure_case_access_by_id(self, test_db, test_user, test_case):
        """Test ensure_case_access_by_id."""
        result = ensure_case_access_by_id(test_case.case_id, test_user, test_db)
        assert result == test_case


class TestEvidenceAccess:
    """Tests pour l'accès aux evidences."""
    
    def test_ensure_evidence_access_owner(self, test_user, test_evidence, test_db):
        """Test que le propriétaire du case peut accéder à l'evidence."""
        result = ensure_evidence_access(test_evidence, test_user, test_db)
        assert result == test_evidence
    
    def test_ensure_evidence_access_not_found(self, test_user):
        """Test qu'une exception est levée si l'evidence n'existe pas."""
        with pytest.raises(HTTPException) as exc_info:
            ensure_evidence_access(None, test_user, None)
        assert exc_info.value.status_code == 404
    
    def test_ensure_evidence_access_by_uid(self, test_db, test_user, test_evidence):
        """Test ensure_evidence_access_by_uid."""
        result = ensure_evidence_access_by_uid(
            test_evidence.evidence_uid, test_user, test_db
        )
        assert result == test_evidence


class TestTaskRunAccess:
    """Tests pour l'accès aux task runs."""
    
    def test_ensure_task_run_access(self, test_db, test_user, test_evidence):
        """Test l'accès à un task run via son evidence."""
        from app.models import TaskRun
        
        task_run = TaskRun(
            task_name="test_task",
            evidence_uid=test_evidence.evidence_uid,
            status="queued",
        )
        test_db.add(task_run)
        test_db.commit()
        test_db.refresh(task_run)
        
        result = ensure_task_run_access(task_run, test_user, test_db)
        assert result == task_run
    
    def test_ensure_task_run_access_not_found(self, test_user):
        """Test qu'une exception est levée si le task run n'existe pas."""
        with pytest.raises(HTTPException) as exc_info:
            ensure_task_run_access(None, test_user, None)
        assert exc_info.value.status_code == 404


class TestAccessibleCaseIds:
    """Tests pour get_accessible_case_ids."""
    
    def test_get_accessible_case_ids_owner(self, test_db, test_user, test_case):
        """Test que les cases possédés sont retournés."""
        case_ids = get_accessible_case_ids(test_db, test_user)
        assert test_case.case_id in case_ids
    
    def test_get_accessible_case_ids_member(self, test_db, test_user):
        """Test que les cases où l'utilisateur est membre sont retournés."""
        # Créer un case appartenant à un autre utilisateur
        other_user = User(
            email="owner@example.com",
            username="owner",
            hashed_password="hash",
            role="admin",
        )
        test_db.add(other_user)
        test_db.commit()
        test_db.refresh(other_user)
        
        shared_case = Case(
            case_id="shared_case",
            status="open",
            owner_id=other_user.id,
        )
        test_db.add(shared_case)
        test_db.commit()
        
        # Ajouter test_user comme membre
        member = CaseMember(
            case_id=shared_case.case_id,
            user_id=test_user.id,
        )
        test_db.add(member)
        test_db.commit()
        
        case_ids = get_accessible_case_ids(test_db, test_user)
        assert shared_case.case_id in case_ids
    
    def test_get_accessible_case_ids_no_access(self, test_db):
        """Test qu'un utilisateur sans cases ne voit rien."""
        user = User(
            email="noaccess@example.com",
            username="noaccess",
            hashed_password="hash",
            role="analyst",
        )
        test_db.add(user)
        test_db.commit()
        test_db.refresh(user)
        
        case_ids = get_accessible_case_ids(test_db, user)
        assert case_ids == []


class TestRestrictQuery:
    """Tests pour restrict_query_to_cases."""
    
    def test_restrict_query_to_cases(self, test_db):
        """Test que la requête est filtrée par case_ids."""
        from sqlalchemy import select
        
        # Créer plusieurs cases
        case1 = Case(case_id="case1", status="open", owner_id=1)
        case2 = Case(case_id="case2", status="open", owner_id=1)
        case3 = Case(case_id="case3", status="open", owner_id=1)
        test_db.add_all([case1, case2, case3])
        test_db.commit()
        
        query = select(Case)
        restricted = restrict_query_to_cases(query, ["case1", "case2"])
        
        results = test_db.execute(restricted).scalars().all()
        case_ids = [c.case_id for c in results]
        
        assert "case1" in case_ids
        assert "case2" in case_ids
        assert "case3" not in case_ids
    
    def test_restrict_query_to_cases_empty_list(self, test_db):
        """Test que la requête retourne rien si la liste est vide."""
        from sqlalchemy import select
        
        query = select(Case)
        restricted = restrict_query_to_cases(query, [])
        
        results = test_db.execute(restricted).scalars().all()
        assert len(results) == 0


