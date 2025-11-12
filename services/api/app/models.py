from datetime import datetime
from typing import Optional, List

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    Boolean,
    ForeignKey,
    Index,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column

from .db import Base


# -----------------
# User
# -----------------
class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)
    full_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verification_token: Mapped[Optional[str]] = mapped_column(
        String, nullable=True, unique=True, index=True
    )
    email_verification_sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )

    # Role-based access control
    role: Mapped[str] = mapped_column(String, default="analyst")  # superadmin, admin, analyst, viewer
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    otp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    otp_secret: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    created_at_utc: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_login_utc: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relations
    cases: Mapped[List["Case"]] = relationship(
        "Case",
        back_populates="owner",
        cascade="all, delete-orphan",
    )
    
    # Cases où l'utilisateur est membre (partagés par un admin)
    shared_cases: Mapped[List["CaseMember"]] = relationship(
        "CaseMember",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    custom_scripts: Mapped[List["CustomScript"]] = relationship(
        "CustomScript",
        back_populates="owner",
        cascade="all, delete-orphan",
    )


# -----------------
# Case
# -----------------
class Case(Base):
    __tablename__ = "cases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    case_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    status: Mapped[str] = mapped_column(String, default="open")
    created_at_utc: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True  # Index pour optimiser le tri
    )

    # Remplace "description" par "note"
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    hedgedoc_slug: Mapped[Optional[str]] = mapped_column(
        String, nullable=True, unique=True, index=True
    )

    # Owner (user who created the case)
    owner_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
    
    # Index composite pour optimiser les requêtes filtrées par owner_id et triées par created_at_utc
    # Cela améliore significativement les performances de list_cases()
    __table_args__ = (
        Index('idx_case_owner_created', 'owner_id', 'created_at_utc'),
    )

    # relations
    owner: Mapped[Optional["User"]] = relationship(
        "User",
        back_populates="cases",
    )

    evidences: Mapped[List["Evidence"]] = relationship(
        "Evidence",
        back_populates="case",
        cascade="all, delete-orphan",
    )

    events: Mapped[List["Event"]] = relationship(
        "Event",
        back_populates="case",
        cascade="all, delete-orphan",
        primaryjoin="Case.case_id == Event.case_id",
    )
    
    # Membres partagés (analystes ajoutés par l'admin propriétaire)
    members: Mapped[List["CaseMember"]] = relationship(
        "CaseMember",
        back_populates="case",
        cascade="all, delete-orphan",
    )


# -----------------
# CaseMember (partage de cases)
# -----------------
class CaseMember(Base):
    __tablename__ = "case_members"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    case_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("cases.case_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    added_at_utc: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    
    # Index unique pour éviter les doublons
    __table_args__ = (
        Index('idx_case_member_unique', 'case_id', 'user_id', unique=True),
    )
    
    # Relations
    case: Mapped["Case"] = relationship(
        "Case",
        back_populates="members",
    )
    user: Mapped["User"] = relationship(
        "User",
        back_populates="shared_cases",
    )


# -----------------
# Evidence
# -----------------
class Evidence(Base):
    __tablename__ = "evidence"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # identifiant logique qu'on manipule partout (pipeline, UI)
    evidence_uid: Mapped[str] = mapped_column(String, unique=True, index=True)
    # lien vers la case (clé fonctionnelle case.case_id, pas l'id auto)
    case_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("cases.case_id"),
        index=True,
    )
    # où est stockée l'image disque / artefact local
    local_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    added_at_utc: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    # N:1 vers Case
    case: Mapped["Case"] = relationship(
        "Case",
        back_populates="evidences",
        primaryjoin="Evidence.case_id == Case.case_id",
    )
    # 1 evidence -> N TaskRun
    task_runs: Mapped[List["TaskRun"]] = relationship(
        "TaskRun",
        back_populates="evidence",
        cascade="all, delete-orphan",
    )


# -----------------
# AnalysisModule
# -----------------
class AnalysisModule(Base):
    __tablename__ = "analysis_modules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # ex: "Parse MFT"
    name: Mapped[str] = mapped_column(String)

    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ex: "parse_mft" -> clé dans TASK_REGISTRY
    tool: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # 1 module -> N TaskRun
    runs: Mapped[List["TaskRun"]] = relationship(
        "TaskRun",
        back_populates="module",
        cascade="all, delete-orphan",
    )


class CustomScript(Base):
    __tablename__ = "custom_scripts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Language configuration
    language: Mapped[str] = mapped_column(String, default="python")  # python, rust, go, node
    language_version: Mapped[str] = mapped_column(String, default="3.11")  # Ex: 3.11, 1.75, 1.21

    # Legacy field (kept for backward compatibility, will be removed later)
    python_version: Mapped[str] = mapped_column(String, default="3.11")

    # Dependencies (format depends on language)
    # Python: requirements.txt format
    # Rust: Cargo.toml dependencies section
    # Go: go.mod format or space-separated packages
    requirements: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Source code or entry point filename
    source_code: Mapped[str] = mapped_column(Text)

    # Additional files (JSON: {filename: content})
    # For multi-file scripts (e.g., Rust with multiple .rs files)
    additional_files: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Build command (optional, for compiled languages)
    # Ex: "cargo build --release", "go build -o script main.go"
    build_command: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Entry point for execution
    # Python: script.py, Rust: ./target/release/script, Go: ./script
    entry_point: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Resource limits
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=300)  # 5 minutes default
    memory_limit_mb: Mapped[int] = mapped_column(Integer, default=512)  # 512MB default
    cpu_limit: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # Ex: "1.5" for 1.5 CPU cores

    created_at_utc: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    owner: Mapped["User"] = relationship(
        "User",
        back_populates="custom_scripts",
    )
    assignments: Mapped[List["UserScript"]] = relationship(
        "UserScript",
        back_populates="script",
        cascade="all, delete-orphan",
    )


class UserScript(Base):
    __tablename__ = "user_scripts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    script_id: Mapped[int] = mapped_column(Integer, ForeignKey("custom_scripts.id"), nullable=False, index=True)
    installed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User")
    script: Mapped["CustomScript"] = relationship(
        "CustomScript",
        back_populates="assignments",
    )


# -----------------
# TaskRun
# -----------------
class TaskRun(Base):
    __tablename__ = "task_run"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    task_name: Mapped[str] = mapped_column(String)
    # lien vers l'evidence (FK explicite -> FIN de l'erreur actuelle)
    evidence_uid: Mapped[str] = mapped_column(
        String,
        ForeignKey("evidence.evidence_uid"),
        index=True,
    )
    status: Mapped[str] = mapped_column(String, default="queued")
    progress_message: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )
    started_at_utc: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    ended_at_utc: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    output_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    celery_task_id: Mapped[Optional[str]] = mapped_column(
        String,
        nullable=True,
        index=True,
    )
    module_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("analysis_modules.id"),
        nullable=True,
        index=True,
    )
    script_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("custom_scripts.id"),
        nullable=True,
        index=True,
    )
    created_at_utc: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    # N:1 vers AnalysisModule
    module: Mapped[Optional["AnalysisModule"]] = relationship(
        "AnalysisModule",
        back_populates="runs",
    )
    # N:1 vers Evidence
    evidence: Mapped["Evidence"] = relationship(
        "Evidence",
        back_populates="task_runs",
    )

    script: Mapped[Optional["CustomScript"]] = relationship("CustomScript")


# -----------------
# Event (timeline)
# -----------------
class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    ts: Mapped[str] = mapped_column(String)  # ISO8601 string
    source: Mapped[str] = mapped_column(String)
    message: Mapped[str] = mapped_column(Text)

    host: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    user: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # tu stockes déjà les tags comme un string genre '["execution", "initial_access"]'
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    case_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("cases.case_id"),
        index=True,
    )

    evidence_uid: Mapped[Optional[str]] = mapped_column(
        String,
        nullable=True,
        index=True,
    )

    raw: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at_utc: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    # N:1 vers Case
    case: Mapped["Case"] = relationship(
        "Case",
        back_populates="events",
        primaryjoin="Event.case_id == Case.case_id",
    )


# -----------------
# FeatureFlag (gestion des fonctionnalités)
# -----------------
class FeatureFlag(Base):
    __tablename__ = "feature_flags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    feature_key: Mapped[str] = mapped_column(String, unique=True, index=True)  # ex: "account_creation", "marketplace", "pipeline"
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at_utc: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
