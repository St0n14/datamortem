# dataMortem

Plateforme d'analyse forensique (FastAPI + React + Celery + OpenSearch).

## Configuration

1. Copier `services/api/.env.example` → `services/api/.env` et ajuster les valeurs :

   ```env
   dm_env=development
   dm_db_url=sqlite:///./dev.db
   dm_celery_broker=memory://
   dm_opensearch_host=localhost
   # ...
   ```

   En `staging`/`production`, le `dm_db_url` doit pointer vers votre Cloud SQL/Postgres, et `dm_celery_broker` vers Redis/MQ (les defaults dev sont refusés).

2. Pour le frontend, définir `VITE_API_BASE_URL` si besoin (`frontend/.env`).

## Démarrage local

### Backend

```bash
cd services/api
uv sync
uv run uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Tests

```bash
cd services/api && uv run pytest
cd frontend && npm run test
```

## Déploiement GCP (résumé)

- Cloud SQL (Postgres) + Memorystore (Redis) + Elastic Cloud/OpenSearch managé.
- API/worker packagés en containers, déployés sur Cloud Run ou GKE.
- Evidences sur Cloud Storage + IAM restreint.
