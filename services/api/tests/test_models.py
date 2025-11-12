"""
Tests unitaires pour app.models
"""
import pytest
from datetime import datetime

from app.models import User, Case, Evidence, Event, CaseMember, TaskRun


class TestUserModel:
    """Tests pour le modèle User."""
    
    def test_create_user(self, test_db):
        """Test la création d'un utilisateur."""
        user = User(
            email="test@example.com",
            username="testuser",
            hashed_password="hashed_password",
            role="analyst",
        )
        test_db.add(user)
        test_db.commit()
        test_db.refresh(user)
        
        assert user.id is not None
        assert user.email == "test@example.com"
        assert user.username == "testuser"
        assert user.role == "analyst"
        assert user.is_active is True  # Default
        assert user.email_verified is False  # Default
    
    def test_user_relationships(self, test_db, test_user, test_case):
        """Test les relations du modèle User."""
        # Vérifier que le case est lié à l'utilisateur
        assert test_case in test_user.cases
        assert test_case.owner_id == test_user.id


class TestCaseModel:
    """Tests pour le modèle Case."""
    
    def test_create_case(self, test_db, test_user):
        """Test la création d'un case."""
        case = Case(
            case_id="test_case",
            status="open",
            note="Test case",
            owner_id=test_user.id,
        )
        test_db.add(case)
        test_db.commit()
        test_db.refresh(case)
        
        assert case.id is not None
        assert case.case_id == "test_case"
        assert case.status == "open"
        assert case.note == "Test case"
        assert case.owner_id == test_user.id
        assert case.created_at_utc is not None
    
    def test_case_relationships(self, test_db, test_user, test_case, test_evidence):
        """Test les relations du modèle Case."""
        # Vérifier que l'evidence est liée au case
        assert test_evidence in test_case.evidences
        assert test_evidence.case_id == test_case.case_id
        
        # Vérifier que le case est lié à l'utilisateur
        assert test_case.owner == test_user


class TestEvidenceModel:
    """Tests pour le modèle Evidence."""
    
    def test_create_evidence(self, test_db, test_case):
        """Test la création d'une evidence."""
        evidence = Evidence(
            evidence_uid="test_evidence",
            case_id=test_case.case_id,
            local_path="/lake/test/evidence.zip",
        )
        test_db.add(evidence)
        test_db.commit()
        test_db.refresh(evidence)
        
        assert evidence.id is not None
        assert evidence.evidence_uid == "test_evidence"
        assert evidence.case_id == test_case.case_id
        assert evidence.local_path == "/lake/test/evidence.zip"
        assert evidence.added_at_utc is not None
    
    def test_evidence_relationship(self, test_db, test_case, test_evidence):
        """Test la relation Evidence -> Case."""
        assert test_evidence.case == test_case
        assert test_evidence.case_id == test_case.case_id


class TestEventModel:
    """Tests pour le modèle Event."""
    
    def test_create_event(self, test_db, test_case, test_evidence):
        """Test la création d'un événement."""
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
        
        assert event.id is not None
        assert event.ts == "2024-01-01T10:00:00Z"
        assert event.source == "PROCESS_CREATE"
        assert event.message == "Test event"
        assert event.case_id == test_case.case_id
        assert event.evidence_uid == test_evidence.evidence_uid
    
    def test_event_relationship(self, test_db, test_case, test_event):
        """Test la relation Event -> Case."""
        assert test_event.case == test_case
        assert test_event.case_id == test_case.case_id


class TestCaseMemberModel:
    """Tests pour le modèle CaseMember."""
    
    def test_create_case_member(self, test_db, test_user, test_case):
        """Test la création d'un membre de case."""
        member = CaseMember(
            case_id=test_case.case_id,
            user_id=test_user.id,
        )
        test_db.add(member)
        test_db.commit()
        test_db.refresh(member)
        
        assert member.id is not None
        assert member.case_id == test_case.case_id
        assert member.user_id == test_user.id
        assert member.added_at_utc is not None
    
    def test_case_member_relationships(self, test_db, test_user, test_case):
        """Test les relations du modèle CaseMember."""
        member = CaseMember(
            case_id=test_case.case_id,
            user_id=test_user.id,
        )
        test_db.add(member)
        test_db.commit()
        test_db.refresh(member)
        
        assert member.case == test_case
        assert member.user == test_user
        assert member in test_case.members
        assert member in test_user.shared_cases


class TestTaskRunModel:
    """Tests pour le modèle TaskRun."""
    
    def test_create_task_run(self, test_db, test_evidence):
        """Test la création d'un task run."""
        task_run = TaskRun(
            task_name="test_task",
            evidence_uid=test_evidence.evidence_uid,
            status="queued",
        )
        test_db.add(task_run)
        test_db.commit()
        test_db.refresh(task_run)
        
        assert task_run.id is not None
        assert task_run.task_name == "test_task"
        assert task_run.evidence_uid == test_evidence.evidence_uid
        assert task_run.status == "queued"
        assert task_run.created_at_utc is not None
    
    def test_task_run_relationship(self, test_db, test_evidence):
        """Test la relation TaskRun -> Evidence."""
        task_run = TaskRun(
            task_name="test_task",
            evidence_uid=test_evidence.evidence_uid,
            status="queued",
        )
        test_db.add(task_run)
        test_db.commit()
        test_db.refresh(task_run)
        
        assert task_run.evidence == test_evidence
        assert task_run.evidence_uid == test_evidence.evidence_uid


