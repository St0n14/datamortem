"""
Tests pour app.routers.health
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


class TestHealthCheck:
    """Tests pour l'endpoint GET /health."""
    
    def test_health_check_public(self, client):
        """Test que l'endpoint health est public et accessible."""
        response = client.get("/api/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "datamortem-api"
    
    def test_health_check_no_auth_required(self, client):
        """Test que l'endpoint health ne nécessite pas d'authentification."""
        response = client.get("/api/health")
        assert response.status_code == 200


class TestSystemStatus:
    """Tests pour l'endpoint GET /health/status."""
    
    def test_system_status_requires_auth(self, client):
        """Test que l'endpoint status nécessite une authentification."""
        response = client.get("/health/status")
        
        assert response.status_code == 403  # Pas de token
    
    def test_system_status_with_auth(self, client, test_db, test_user):
        """Test que l'endpoint status fonctionne avec authentification."""
        from app.auth.security import create_access_token
        
        token = create_access_token(
            {
                "sub": str(test_user.id),
                "username": test_user.username,
                "email": test_user.email,
                "role": test_user.role,
            }
        )
        
        response = client.get(
            "/api/health/status",
            headers={"Authorization": f"Bearer {token}"},
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "api" in data
        assert "postgres" in data
        assert "redis" in data
        assert "celery" in data
        assert "opensearch" in data


class TestReadinessCheck:
    """Tests pour l'endpoint GET /health/ready."""
    
    def test_readiness_check_public(self, client):
        """Test que l'endpoint ready est public."""
        # Note: Le test peut échouer si PostgreSQL/Redis ne sont pas disponibles
        # C'est normal en environnement de test
        response = client.get("/api/health/ready")
        
        # Peut être 200 ou 503 selon la disponibilité des services
        assert response.status_code in [200, 503]


class TestLivenessCheck:
    """Tests pour l'endpoint GET /health/live."""
    
    def test_liveness_check_public(self, client):
        """Test que l'endpoint live est public et toujours disponible."""
        response = client.get("/api/health/live")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "alive"

