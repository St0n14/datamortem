from fastapi import FastAPI

from .db import engine
from .models import Base

# créer les tables si pas encore créées
Base.metadata.create_all(bind=engine)

from .routers import cases, evidence, modules, runs  # <-- après que packages existent

app = FastAPI(
    title="DataMortem Ingest API",
    version="0.0.1",
)

app.include_router(cases.router,    prefix="/cases",    tags=["cases"])
app.include_router(evidence.router, prefix="/evidence", tags=["evidence"])
app.include_router(modules.router,  prefix="/modules",  tags=["modules"])
app.include_router(runs.router,     prefix="/runs",     tags=["runs"])

@app.get("/health")
def healthcheck():
    return {"status": "ok"}
