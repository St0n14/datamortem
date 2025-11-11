from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded
from .config import settings
from .db import Base, engine
from .routers import pipeline, events, case, evidence, artifacts, search, indexing, auth, scripts, health, admin, rules
from .opensearch.client import close_opensearch_client
from .middleware.rate_limit import limiter, create_rate_limit_exceeded_handler
from .middleware.security_headers import SecurityHeadersMiddleware

# Assure que les tables existent (SQLite dev mode)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="dataMortem API",
    version="0.1.0",
    description="Digital Forensics Investigation Platform"
)

# Rate limiting middleware (only if enabled) - MUST be added first
if settings.dm_rate_limit_enabled:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, create_rate_limit_exceeded_handler())
    app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security headers middleware
app.add_middleware(SecurityHeadersMiddleware)

# routes
app.include_router(auth.router)                       # Authentication (no prefix, has /api/auth in router)
app.include_router(case.router, prefix="/api")
app.include_router(evidence.router, prefix="/api")
app.include_router(pipeline.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(artifacts.router, prefix="/api")
app.include_router(search.router, prefix="/api")      # OpenSearch search
app.include_router(indexing.router, prefix="/api")    # OpenSearch indexing
app.include_router(scripts.router)                    # Custom scripts management
app.include_router(health.router, prefix="/api")      # System health status
app.include_router(admin.router, prefix="/api")       # Admin stats
app.include_router(rules.router, prefix="/api")       # Rules management

@app.get("/health")
def health():
    return {"status": "ok", "env": settings.dm_env}

@app.on_event("shutdown")
def shutdown_event():
    """Ferme proprement les connexions lors du shutdown."""
    close_opensearch_client()
