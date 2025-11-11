"""
Tests d'intégration pour app.routers.case
"""
import pytest
from fastapi.testclient import TestClient

from app.auth.security import create_access_token
from app.models import Case, CaseMember


class TestListCases:
    """Tests pour l'endpoint GET /api/cases."""
    
    def test_list_cases_empty(self, client, test_db, test_user):
        """Test la liste des cases quand l'utilisateur n'en a aucun."""
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        response = client.get(
            "/api/cases",
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 200
        assert response.json() == []
    
    def test_list_cases_owned(self, client, test_db, test_user, test_case):
        """Test que l'utilisateur voit ses propres cases."""
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        response = client.get(
            "/api/cases",
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["case_id"] == test_case.case_id
    
    def test_list_cases_shared(self, client, test_db, test_user):
        """Test que l'utilisateur voit les cases partagés."""
        from app.models import User
        
        # Créer un autre utilisateur avec un case
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
        
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        response = client.get(
            "/api/cases",
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        case_ids = [c["case_id"] for c in data]
        assert "shared_case" in case_ids
    
    def test_list_cases_no_access(self, client, test_db, test_user):
        """Test que l'utilisateur ne voit pas les cases d'autres utilisateurs."""
        from app.models import User
        
        other_user = User(
            email="other@example.com",
            username="other",
            hashed_password="hash",
            role="admin",
        )
        test_db.add(other_user)
        test_db.commit()
        test_db.refresh(other_user)
        
        other_case = Case(
            case_id="other_case",
            status="open",
            owner_id=other_user.id,
        )
        test_db.add(other_case)
        test_db.commit()
        
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        response = client.get(
            "/api/cases",
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        case_ids = [c["case_id"] for c in data]
        assert "other_case" not in case_ids


class TestCreateCase:
    """Tests pour l'endpoint POST /api/cases."""
    
    def test_create_case_success(self, client, test_db, test_user):
        """Test la création d'un case."""
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        response = client.post(
            "/api/cases",
            json={
                "case_id": "new_case_001",
                "note": "Test case",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["case_id"] == "new_case_001"
        assert data["status"] == "open"
        assert data["note"] == "Test case"
    
    def test_create_case_duplicate(self, client, test_db, test_user, test_case):
        """Test que la création échoue avec un case_id existant."""
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        response = client.post(
            "/api/cases",
            json={
                "case_id": test_case.case_id,
                "note": "Duplicate",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 409
    
    def test_create_case_no_write_permission(self, client, test_db):
        """Test que la création échoue sans permission d'écriture."""
        from app.models import User
        from app.auth.security import get_password_hash
        
        viewer = User(
            email="viewer@example.com",
            username="viewer",
            hashed_password=get_password_hash("password123"),
            role="viewer",
        )
        test_db.add(viewer)
        test_db.commit()
        test_db.refresh(viewer)
        
        token = create_access_token(
            {
                "sub": str(viewer.id),
                "username": viewer.username,
                "email": viewer.email,
                "role": viewer.role,
            }
        )
        
        response = client.post(
            "/api/cases",
            json={
                "case_id": "new_case",
                "note": "Test",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 403


class TestGetCase:
    """Tests pour l'endpoint GET /api/cases/{case_id}."""
    
    def test_get_case_success(self, client, test_db, test_user, test_case):
        """Test la récupération d'un case."""
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        response = client.get(
            f"/api/cases/{test_case.case_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["case_id"] == test_case.case_id
    
    def test_get_case_not_found(self, client, test_db, test_user):
        """Test que la récupération échoue pour un case inexistant."""
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        response = client.get(
            "/api/cases/nonexistent",
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 404
    
    def test_get_case_forbidden(self, client, test_db, test_user):
        """Test que la récupération échoue pour un case non accessible."""
        from app.models import User
        from app.auth.security import get_password_hash
        
        other_user = User(
            email="other@example.com",
            username="other",
            hashed_password=get_password_hash("password123"),
            role="admin",
        )
        test_db.add(other_user)
        test_db.commit()
        test_db.refresh(other_user)
        
        other_case = Case(
            case_id="other_case",
            status="open",
            owner_id=other_user.id,
        )
        test_db.add(other_case)
        test_db.commit()
        
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        response = client.get(
            f"/api/cases/{other_case.case_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 403


class TestUpdateCase:
    """Tests pour l'endpoint PATCH /api/cases/{case_id}."""
    
    def test_update_case_success(self, client, test_db, test_user, test_case):
        """Test la mise à jour d'un case."""
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        response = client.patch(
            f"/api/cases/{test_case.case_id}",
            json={
                "note": "Updated note",
                "status": "closed",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["note"] == "Updated note"
        assert data["status"] == "closed"
    
    def test_update_case_no_write_permission(self, client, test_db, test_user, test_case):
        """Test que la mise à jour échoue sans permission d'écriture."""
        from app.models import User
        from app.auth.security import get_password_hash
        
        viewer = User(
            email="viewer@example.com",
            username="viewer",
            hashed_password=get_password_hash("password123"),
            role="viewer",
        )
        test_db.add(viewer)
        test_db.commit()
        test_db.refresh(viewer)
        
        # Ajouter viewer comme membre (lecture seule)
        member = CaseMember(
            case_id=test_case.case_id,
            user_id=viewer.id,
        )
        test_db.add(member)
        test_db.commit()
        
        token = create_access_token(
            {
                "sub": str(viewer.id),
                "username": viewer.username,
                "email": viewer.email,
                "role": viewer.role,
            }
        )
        
        response = client.patch(
            f"/api/cases/{test_case.case_id}",
            json={"note": "Updated"},
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 403


class TestDeleteCase:
    """Tests pour l'endpoint DELETE /api/cases/{case_id}."""
    
    def test_delete_case_success(self, client, test_db, test_user):
        """Test la suppression d'un case."""
        case = Case(
            case_id="to_delete",
            status="open",
            owner_id=test_user.id,
        )
        test_db.add(case)
        test_db.commit()
        
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        response = client.delete(
            f"/api/cases/{case.case_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 204
        
        # Vérifier que le case a été supprimé
        deleted = test_db.query(Case).filter(Case.case_id == case.case_id).first()
        assert deleted is None
    
    def test_delete_case_no_write_permission(self, client, test_db, test_user, test_case):
        """Test que la suppression échoue sans permission d'écriture."""
        from app.models import User
        from app.auth.security import get_password_hash
        
        viewer = User(
            email="viewer@example.com",
            username="viewer",
            hashed_password=get_password_hash("password123"),
            role="viewer",
        )
        test_db.add(viewer)
        test_db.commit()
        test_db.refresh(viewer)
        
        token = create_access_token(
            {
                "sub": str(viewer.id),
                "username": viewer.username,
                "email": viewer.email,
                "role": viewer.role,
            }
        )
        
        response = client.delete(
            f"/api/cases/{test_case.case_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 403


class TestCaseMembers:
    """Tests pour la gestion des membres de cases."""
    
    def test_add_case_member_success(self, client, test_db, test_user):
        """Test qu'un admin peut ajouter un analyste à son case."""
        from app.models import User
        from app.auth.security import get_password_hash
        
        # Créer un admin avec un case
        admin = User(
            email="admin@example.com",
            username="admin",
            hashed_password=get_password_hash("password123"),
            role="admin",
        )
        test_db.add(admin)
        test_db.commit()
        test_db.refresh(admin)
        
        admin_case = Case(
            case_id="admin_case",
            status="open",
            owner_id=admin.id,
        )
        test_db.add(admin_case)
        test_db.commit()
        
        # Créer un analyste
        analyst = User(
            email="analyst@example.com",
            username="analyst",
            hashed_password=get_password_hash("password123"),
            role="analyst",
        )
        test_db.add(analyst)
        test_db.commit()
        test_db.refresh(analyst)
        
        admin_token = create_access_token(
            {
                "sub": str(admin.id),
                "username": admin.username,
                "email": admin.email,
                "role": admin.role,
            }
        )
        
        response = client.post(
            f"/api/cases/{admin_case.case_id}/members",
            json={"user_id": analyst.id},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == analyst.id
        assert data["case_id"] == admin_case.case_id
        assert data["username"] == analyst.username
    
    def test_add_case_member_not_owner(self, client, test_db, test_user, test_case):
        """Test qu'un non-propriétaire ne peut pas ajouter de membre."""
        from app.models import User
        from app.auth.security import get_password_hash
        
        other_user = User(
            email="other@example.com",
            username="other",
            hashed_password=get_password_hash("password123"),
            role="admin",
        )
        test_db.add(other_user)
        test_db.commit()
        test_db.refresh(other_user)
        
        token = create_access_token(
            {
                "sub": str(other_user.id),
                "username": other_user.username,
                "email": other_user.email,
                "role": other_user.role,
            }
        )
        
        response = client.post(
            f"/api/cases/{test_case.case_id}/members",
            json={"user_id": other_user.id},
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 403
    
    def test_add_case_member_not_admin(self, client, test_db, test_user, test_case):
        """Test qu'un analyste ne peut pas ajouter de membre même s'il est propriétaire."""
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        # Créer un autre analyste
        from app.models import User
        from app.auth.security import get_password_hash
        
        other_analyst = User(
            email="analyst2@example.com",
            username="analyst2",
            hashed_password=get_password_hash("password123"),
            role="analyst",
        )
        test_db.add(other_analyst)
        test_db.commit()
        test_db.refresh(other_analyst)
        
        response = client.post(
            f"/api/cases/{test_case.case_id}/members",
            json={"user_id": other_analyst.id},
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 403
    
    def test_list_case_members(self, client, test_db, test_user, test_case):
        """Test la liste des membres d'un case."""
        # Ajouter un membre
        from app.models import User
        from app.auth.security import get_password_hash
        
        member_user = User(
            email="member@example.com",
            username="member",
            hashed_password=get_password_hash("password123"),
            role="analyst",
        )
        test_db.add(member_user)
        test_db.commit()
        test_db.refresh(member_user)
        
        member = CaseMember(
            case_id=test_case.case_id,
            user_id=member_user.id,
        )
        test_db.add(member)
        test_db.commit()
        
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        response = client.get(
            f"/api/cases/{test_case.case_id}/members",
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["user_id"] == member_user.id
        assert data[0]["username"] == member_user.username
    
    def test_remove_case_member_success(self, client, test_db, test_user):
        """Test qu'un admin peut retirer un analyste de son case."""
        from app.models import User
        from app.auth.security import get_password_hash
        
        # Créer un admin avec un case
        admin = User(
            email="admin@example.com",
            username="admin",
            hashed_password=get_password_hash("password123"),
            role="admin",
        )
        test_db.add(admin)
        test_db.commit()
        test_db.refresh(admin)
        
        admin_case = Case(
            case_id="admin_case",
            status="open",
            owner_id=admin.id,
        )
        test_db.add(admin_case)
        test_db.commit()
        
        # Créer un analyste et l'ajouter comme membre
        analyst = User(
            email="analyst@example.com",
            username="analyst",
            hashed_password=get_password_hash("password123"),
            role="analyst",
        )
        test_db.add(analyst)
        test_db.commit()
        test_db.refresh(analyst)
        
        member = CaseMember(
            case_id=admin_case.case_id,
            user_id=analyst.id,
        )
        test_db.add(member)
        test_db.commit()
        
        admin_token = create_access_token(
            {
                "sub": str(admin.id),
                "username": admin.username,
                "email": admin.email,
                "role": admin.role,
            }
        )
        
        response = client.delete(
            f"/api/cases/{admin_case.case_id}/members/{analyst.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        
        assert response.status_code == 204
        
        # Vérifier que le membre a été supprimé
        deleted = test_db.query(CaseMember).filter(
            CaseMember.case_id == admin_case.case_id,
            CaseMember.user_id == analyst.id
        ).first()
        assert deleted is None

