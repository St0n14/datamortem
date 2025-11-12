"""
Tests unitaires pour app.auth.security
"""
import pytest
from datetime import timedelta
import jwt

from app.auth.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    decode_access_token,
    SECRET_KEY,
    ALGORITHM,
)


class TestPasswordHashing:
    """Tests pour le hachage et la vérification de mots de passe."""
    
    def test_get_password_hash(self):
        """Test que le hachage génère un hash différent du mot de passe original."""
        password = "testpassword123"
        hashed = get_password_hash(password)
        
        assert hashed != password
        assert len(hashed) > 0
        assert hashed.startswith("$2b$")  # Format bcrypt
    
    def test_verify_password_correct(self):
        """Test que la vérification fonctionne avec le bon mot de passe."""
        password = "testpassword123"
        hashed = get_password_hash(password)
        
        assert verify_password(password, hashed) is True
    
    def test_verify_password_incorrect(self):
        """Test que la vérification échoue avec un mauvais mot de passe."""
        password = "testpassword123"
        wrong_password = "wrongpassword"
        hashed = get_password_hash(password)
        
        assert verify_password(wrong_password, hashed) is False
    
    def test_verify_password_different_hashes(self):
        """Test que le même mot de passe génère des hash différents (salt unique)."""
        password = "testpassword123"
        hashed1 = get_password_hash(password)
        hashed2 = get_password_hash(password)
        
        # Les hash doivent être différents à cause du salt
        assert hashed1 != hashed2
        # Mais les deux doivent vérifier le même mot de passe
        assert verify_password(password, hashed1) is True
        assert verify_password(password, hashed2) is True


class TestJWTTokens:
    """Tests pour la création et décodage de tokens JWT."""
    
    def test_create_access_token(self):
        """Test la création d'un token JWT."""
        data = {"sub": "testuser", "user_id": 1, "role": "analyst"}
        token = create_access_token(data)
        
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0
    
    def test_create_access_token_with_expires_delta(self):
        """Test la création d'un token avec expiration personnalisée."""
        data = {"sub": "testuser", "user_id": 1}
        expires_delta = timedelta(minutes=60)
        token = create_access_token(data, expires_delta=expires_delta)
        
        # Décoder pour vérifier l'expiration
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert "exp" in payload
    
    def test_decode_access_token_valid(self):
        """Test le décodage d'un token valide."""
        data = {"sub": "testuser", "user_id": 1, "role": "analyst"}
        token = create_access_token(data)
        
        decoded = decode_access_token(token)
        
        assert decoded is not None
        assert decoded["sub"] == "testuser"
        assert decoded["user_id"] == 1
        assert decoded["role"] == "analyst"
        assert "exp" in decoded
    
    def test_decode_access_token_invalid(self):
        """Test le décodage d'un token invalide."""
        invalid_token = "invalid.token.here"
        
        decoded = decode_access_token(invalid_token)
        
        assert decoded is None
    
    def test_decode_access_token_expired(self):
        """Test le décodage d'un token expiré."""
        data = {"sub": "testuser", "user_id": 1}
        # Créer un token expiré
        expired_delta = timedelta(minutes=-1)
        token = create_access_token(data, expires_delta=expired_delta)
        
        decoded = decode_access_token(token)
        
        assert decoded is None
    
    def test_token_contains_all_data(self):
        """Test que le token contient toutes les données fournies."""
        data = {
            "sub": "testuser",
            "user_id": 1,
            "email": "test@example.com",
            "role": "admin",
        }
        token = create_access_token(data)
        decoded = decode_access_token(token)
        
        assert decoded["sub"] == data["sub"]
        assert decoded["user_id"] == data["user_id"]
        assert decoded["email"] == data["email"]
        assert decoded["role"] == data["role"]


