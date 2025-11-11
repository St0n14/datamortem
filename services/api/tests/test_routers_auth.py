"""
Tests d'intégration pour app.routers.auth
"""
import pytest
from fastapi.testclient import TestClient

from app.auth.security import create_access_token
from app.models import User


class TestRegister:
    """Tests pour l'endpoint /api/auth/register."""
    
    def test_register_success(self, client, test_db):
        """Test l'enregistrement d'un nouvel utilisateur."""
        response = client.post(
            "/api/auth/register",
            json={
                "email": "newuser@example.com",
                "username": "newuser",
                "password": "newpass123",
                "full_name": "New User",
            },
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "newuser@example.com"
        assert data["username"] == "newuser"
        assert "id" in data
        assert "password" not in data  # Le mot de passe ne doit pas être retourné
    
    def test_register_duplicate_email(self, client, test_db, test_user):
        """Test que l'enregistrement échoue avec un email existant."""
        response = client.post(
            "/api/auth/register",
            json={
                "email": test_user.email,
                "username": "different_username",
                "password": "password123",
            },
        )
        
        assert response.status_code == 400
        assert "email" in response.json()["detail"].lower()
    
    def test_register_duplicate_username(self, client, test_db, test_user):
        """Test que l'enregistrement échoue avec un username existant."""
        response = client.post(
            "/api/auth/register",
            json={
                "email": "different@example.com",
                "username": test_user.username,
                "password": "password123",
            },
        )
        
        assert response.status_code == 400
        assert "username" in response.json()["detail"].lower()
    
    def test_register_weak_password(self, client, test_db):
        """Test que l'enregistrement échoue avec un mot de passe trop court."""
        response = client.post(
            "/api/auth/register",
            json={
                "email": "user@example.com",
                "username": "user",
                "password": "short",  # Trop court
            },
        )
        
        assert response.status_code == 422  # Validation error


class TestLogin:
    """Tests pour l'endpoint /api/auth/login."""
    
    def test_login_success(self, client, test_db, test_user):
        """Test la connexion avec des identifiants valides."""
        response = client.post(
            "/api/auth/login",
            json={
                "username": test_user.username,
                "password": "testpass123",
            },
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "expires_in" in data
    
    def test_login_invalid_username(self, client, test_db):
        """Test que la connexion échoue avec un username invalide."""
        response = client.post(
            "/api/auth/login",
            json={
                "username": "nonexistent",
                "password": "password123",
            },
        )
        
        assert response.status_code == 401
    
    def test_login_invalid_password(self, client, test_db, test_user):
        """Test que la connexion échoue avec un mot de passe invalide."""
        response = client.post(
            "/api/auth/login",
            json={
                "username": test_user.username,
                "password": "wrongpassword",
            },
        )
        
        assert response.status_code == 401
    
    def test_login_inactive_user(self, client, test_db):
        """Test que la connexion échoue pour un utilisateur inactif."""
        from app.auth.security import get_password_hash
        
        user = User(
            email="inactive@example.com",
            username="inactive",
            hashed_password=get_password_hash("password123"),
            is_active=False,
        )
        test_db.add(user)
        test_db.commit()
        
        response = client.post(
            "/api/auth/login",
            json={
                "username": "inactive",
                "password": "password123",
            },
        )
        
        assert response.status_code == 403


class TestGetCurrentUser:
    """Tests pour l'endpoint /api/auth/me."""
    
    def test_get_current_user_success(self, client, test_db, test_user):
        """Test la récupération du profil utilisateur."""
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_user.id
        assert data["email"] == test_user.email
        assert data["username"] == test_user.username
    
    def test_get_current_user_no_token(self, client):
        """Test que l'accès sans token échoue."""
        response = client.get("/api/auth/me")
        
        assert response.status_code == 403
    
    def test_get_current_user_invalid_token(self, client):
        """Test que l'accès avec un token invalide échoue."""
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalid.token.here"},
        )
        
        assert response.status_code == 401


class TestChangePassword:
    """Tests pour l'endpoint /api/auth/change-password."""
    
    def test_change_password_success(self, client, test_db, test_user):
        """Test le changement de mot de passe."""
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        response = client.post(
            "/api/auth/change-password",
            json={
                "current_password": "testpass123",
                "new_password": "newpassword123",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 200
        
        # Vérifier que le nouveau mot de passe fonctionne
        login_response = client.post(
            "/api/auth/login",
            json={
                "username": test_user.username,
                "password": "newpassword123",
            },
        )
        assert login_response.status_code == 200
    
    def test_change_password_wrong_current(self, client, test_db, test_user):
        """Test que le changement échoue avec le mauvais mot de passe actuel."""
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        response = client.post(
            "/api/auth/change-password",
            json={
                "current_password": "wrongpassword",
                "new_password": "newpassword123",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 400
    
    def test_change_password_weak_new(self, client, test_db, test_user):
        """Test que le changement échoue avec un nouveau mot de passe trop court."""
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        response = client.post(
            "/api/auth/change-password",
            json={
                "current_password": "testpass123",
                "new_password": "short",
            },
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 422

