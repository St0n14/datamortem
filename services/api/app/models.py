from sqlalchemy.orm import declarative_base, Mapped, mapped_column, relationship
from sqlalchemy import String, Integer, DateTime, ForeignKey, Boolean, Text
from datetime import datetime

Base = declarative_base()

class Case(Base):
    __tablename__ = "cases"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    case_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    customer_name: Mapped[str] = mapped_column(String(256))
    incident_start_utc: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    created_at_utc: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), default=datetime.utcnow
    )

    evidences = relationship("Evidence", back_populates="case")

class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    evidence_uid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    case_id_fk: Mapped[int] = mapped_column(ForeignKey("cases.id"))
    original_filename: Mapped[str] = mapped_column(String(512))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha1: Mapped[str] = mapped_column(String(64))
    sha256: Mapped[str] = mapped_column(String(128))

    local_path: Mapped[str] = mapped_column(String(1024))
    # chemin absolu vers le fichier disque cible (ex: flare.vmdk sauvegardé chez toi)

    status: Mapped[str] = mapped_column(String(32), default="registered")
    created_at_utc: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), default=datetime.utcnow
    )

    case = relationship("Case", back_populates="evidences")
    datasets = relationship("Dataset", back_populates="evidence")
    task_runs = relationship("TaskRun", back_populates="evidence")


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    evidence_id_fk: Mapped[int] = mapped_column(ForeignKey("evidence.id"))

    module_name: Mapped[str] = mapped_column(String(128))
    storage_path: Mapped[str] = mapped_column(Text)

    created_at_utc: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), default=datetime.utcnow
    )

    evidence = relationship("Evidence", back_populates="datasets")


class AnalysisModule(Base):
    __tablename__ = "analysis_modules"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(512))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at_utc: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), default=datetime.utcnow
    )
    updated_at_utc: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    runs = relationship("TaskRun", back_populates="module")


class TaskRun(Base):
    __tablename__ = "task_runs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    evidence_id_fk: Mapped[int] = mapped_column(ForeignKey("evidence.id"))
    module_id_fk: Mapped[int] = mapped_column(ForeignKey("analysis_modules.id"))

    status: Mapped[str] = mapped_column(String(32), default="pending")
    # pending | running | success | error

    started_at_utc: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=True)
    ended_at_utc: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=True)

    error_message: Mapped[str] = mapped_column(Text, default="")
    output_path: Mapped[str] = mapped_column(Text, default="")

    module = relationship("AnalysisModule", back_populates="runs")
    evidence = relationship("Evidence", back_populates="task_runs")
