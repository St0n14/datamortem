"""
Configuration et fixtures partagées pour les tests pytest.
"""
import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.models import User, Case, Evidence, Event, CaseMember
from app.auth.security import get_password_hash
from app.config import settings


# Base de données de test en mémoire
TEST_DB_URL = "sqlite:///:memory:"


@pytest.fixture(scope="function")
def test_db():
    """
    Crée une base de données SQLite en mémoire pour chaque test.
    """
    engine = create_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(engine)


@pytest.fixture
def test_user(test_db):
    """
    Crée un utilisateur de test standard (analyst).
    """
    user = User(
        email="test@example.com",
        username="testuser",
        hashed_password=get_password_hash("testpass123"),
        full_name="Test User",
        role="analyst",
        is_active=True,
        email_verified=True,
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def test_admin_user(test_db):
    """
    Crée un utilisateur admin de test.
    """
    user = User(
        email="admin@example.com",
        username="admin",
        hashed_password=get_password_hash("admin123"),
        full_name="Admin User",
        role="admin",
        is_active=True,
        email_verified=True,
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def test_superadmin_user(test_db):
    """
    Crée un utilisateur superadmin de test.
    """
    user = User(
        email="superadmin@example.com",
        username="superadmin",
        hashed_password=get_password_hash("superadmin123"),
        full_name="Super Admin",
        role="superadmin",
        is_active=True,
        is_superuser=True,
        email_verified=True,
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def test_case(test_db, test_user):
    """
    Crée un case de test appartenant à test_user.
    """
    case = Case(
        case_id="test_case_001",
        status="open",
        note="Test case",
        owner_id=test_user.id,
    )
    test_db.add(case)
    test_db.commit()
    test_db.refresh(case)
    return case


@pytest.fixture
def test_evidence(test_db, test_case):
    """
    Crée une evidence de test liée à test_case.
    """
    evidence = Evidence(
        evidence_uid="test_evidence_001",
        case_id=test_case.case_id,
        local_path="/lake/test_case_001/evidences/test_evidence_001/test.zip",
    )
    test_db.add(evidence)
    test_db.commit()
    test_db.refresh(evidence)
    return evidence


@pytest.fixture
def test_event(test_db, test_case, test_evidence):
    """
    Crée un événement de test.
    """
    event = Event(
        ts="2024-01-01T10:00:00Z",
        source="PROCESS_CREATE",
        message="Test event",
        host="WKST-01",
        user="testuser",
        tags='["execution"]',
        score=50,
        case_id=test_case.case_id,
        evidence_uid=test_evidence.evidence_uid,
        raw='{"test": true}',
    )
    test_db.add(event)
    test_db.commit()
    test_db.refresh(event)
    return event


@pytest.fixture
def client(test_db):
    """
    Crée un client FastAPI de test avec la DB de test.
    """
    from fastapi.testclient import TestClient
    from app.main import app
    
    def override_get_db():
        try:
            yield test_db
        finally:
            pass  # On ne ferme pas la session de test ici
    
    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

