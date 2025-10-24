from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from .config import settings

DB_URL = settings.DATABASE_URL or "sqlite+pysqlite:///./dev.db"

engine = create_engine(
    DB_URL,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
