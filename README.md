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

### Prise de notes HedgeDoc

- `docker-compose` embarque désormais un service `hedgedoc` (accessible sur http://localhost:3000) et sa base Postgres dédiée.
- L'API FastAPI crée automatiquement un pad HedgeDoc pour chaque nouveau case (slug aléatoire) et renvoie l'URL via le champ `hedgedoc_url`.
- Les variables suivantes peuvent être ajustées si vous avez déjà un HedgeDoc externe :
  - `DM_HEDGEDOC_ENABLED` (par défaut `true` en local)
  - `DM_HEDGEDOC_BASE_URL` (URL interne utilisée par l'API, ex. `http://hedgedoc:3000`)
  - `DM_HEDGEDOC_PUBLIC_URL` (URL partagée avec les utilisateurs, ex. `http://localhost:3000`)

Les notes sont pré-créées côté serveur afin d'être immédiatement disponibles lorsque l'utilisateur clique sur le bouton "Ouvrir dans HedgeDoc".

## Tests

```bash
cd services/api && uv run pytest
cd frontend && npm run test
```

## Déploiement GCP (résumé)

- Cloud SQL (Postgres) + Memorystore (Redis) + Elastic Cloud/OpenSearch managé.
- API/worker packagés en containers, déployés sur Cloud Run ou GKE.
- Evidences sur Cloud Storage + IAM restreint.
