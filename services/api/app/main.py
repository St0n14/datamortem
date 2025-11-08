from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .db import Base, engine
from .routers import pipeline, events, case, evidence, artifacts, search, indexing, auth
from .opensearch.client import close_opensearch_client

# Assure que les tables existent (SQLite dev mode)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="dataMortem API",
    version="0.1.0",
    description="Digital Forensics Investigation Platform"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# routes
app.include_router(auth.router)                       # Authentication (no prefix, has /api/auth in router)
app.include_router(case.router, prefix="/api")
app.include_router(evidence.router, prefix="/api")
app.include_router(pipeline.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(artifacts.router, prefix="/api")
app.include_router(search.router, prefix="/api")      # OpenSearch search
app.include_router(indexing.router, prefix="/api")    # OpenSearch indexing

@app.get("/health")
def health():
    return {"status": "ok", "env": settings.dm_env}

@app.on_event("shutdown")
def shutdown_event():
    """Ferme proprement les connexions lors du shutdown."""
    close_opensearch_client()
