from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from .config import settings

# Configuration du pool de connexions pour améliorer les performances
# SQLite n'utilise pas de pool, mais PostgreSQL/MySQL oui
connect_args = {}
pool_config = {}

if "sqlite" in settings.dm_db_url:
    # SQLite: pas de pool mais check_same_thread nécessaire
    connect_args = {"check_same_thread": False}
else:
    # PostgreSQL/MySQL: configuration du pool
    pool_config = {
        "pool_size": 10,  # Nombre de connexions maintenues dans le pool
        "max_overflow": 20,  # Nombre supplémentaire de connexions autorisées
        "pool_pre_ping": True,  # Vérifie que les connexions sont valides avant utilisation
        "pool_recycle": 3600,  # Recycle les connexions après 1 heure
    }

# Crée l'engine avec configuration optimisée
engine = create_engine(
    settings.dm_db_url,
    connect_args=connect_args,
    **pool_config
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
