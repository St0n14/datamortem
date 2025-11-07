from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from .config import settings

# Crée l'engine avec check_same_thread=False pour SQLite (sera ignoré pour PostgreSQL)
engine = create_engine(
    settings.dm_db_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.dm_db_url else {}
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db() -> Session:
    """
    Dependency pour obtenir une session DB dans les endpoints FastAPI.

    Usage:
        @router.get("/items")
        def get_items(db: Session = Depends(get_db)):
            return db.query(Item).all()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
