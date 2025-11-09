# Guide de démarrage de la stack complète dataMortem

Ce guide explique comment démarrer toute la stack dataMortem avec OpenSearch intégré.

## 🎯 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                      │
│                   http://localhost:5174                  │
└───────────────────────────┬─────────────────────────────┘
                            │ REST API
┌───────────────────────────┴─────────────────────────────┐
│                    API FastAPI                           │
│                   http://localhost:8080                  │
└─┬─────────────┬─────────────┬─────────────┬────────────┘
  │             │             │             │
  ▼             ▼             ▼             ▼
┌─────────┐ ┌──────┐   ┌─────────────┐ ┌────────────┐
│PostgreSQL│ │Redis │   │ OpenSearch  │ │   Celery   │
│  :5432  │ │:6379 │   │    :9200    │ │   Worker   │
└─────────┘ └──────┘   └─────────────┘ └────────────┘
```

## 📋 Prérequis

- **Docker** et **Docker Compose**
- **Python 3.10+** avec **uv** installé
- **Node.js 18+** et **npm**
- **PostgreSQL client** (psql) - optionnel pour debug

## 🚀 Démarrage rapide (automatique)

### Option 1: Script tout-en-un

```bash
# Rendre le script exécutable
chmod +x start-stack.sh

# Démarrer toute la stack
./start-stack.sh
```

Ce script va automatiquement:
1. ✅ Démarrer PostgreSQL, Redis, OpenSearch (Docker)
2. ✅ Créer la base de données
3. ✅ Démarrer Celery Worker
4. ✅ Démarrer l'API FastAPI
5. ✅ Démarrer le Frontend React

**Arrêter la stack:**
```bash
./stop-stack.sh
```

---

### Mode multi-réplicas / load balancing (local)

Une instance Traefik est maintenant incluse pour équilibrer les requêtes entre plusieurs API FastAPI.

1. Démarrer la stack complète :
   ```bash
   docker-compose up -d --build
   ```
2. Ajouter des réplicas API (et workers) à la volée :
   ```bash
   docker-compose up -d --scale api=2 --scale celery-worker=2
   ```
3. Vérifier que le load balancer répond :
   ```bash
   curl http://localhost:8080/health
   ```

Traefik écoute sur `http://localhost:8080` et route automatiquement vers tous les conteneurs `api`. Le frontend (port 5174) et les clients doivent maintenant appeler `http://localhost:8080/api/...`.

---

## 🔧 Démarrage manuel (étape par étape)

### ÉTAPE 1: Démarrer les services Docker

```bash
# Démarre PostgreSQL, Redis, OpenSearch, Dashboards
docker-compose up -d

# Vérifier que tous les services sont UP
docker-compose ps
```

Attendez ~30 secondes que OpenSearch démarre.

**Vérifications:**
```bash
# PostgreSQL
docker exec datamortem-postgres pg_isready -U datamortem

# Redis
docker exec datamortem-redis redis-cli ping

# OpenSearch
curl http://localhost:9200
```

---

### ÉTAPE 2: Configuration de l'API

Le fichier `.env` est déjà configuré pour utiliser la stack Docker:

```bash
cat services/api/.env
```

Devrait contenir:
```env
DM_ENV=development
DM_DB_URL=postgresql://datamortem:datamortem_dev_password@localhost:5432/datamortem
DM_CELERY_BROKER=redis://localhost:6379/0
DM_CELERY_BACKEND=redis://localhost:6379/1
DM_OPENSEARCH_HOST=localhost
DM_OPENSEARCH_PORT=9200
...
```

> 🔐 **Important – DM_JWT_SECRET obligatoire**
>
> - Générez un secret aléatoire d’au moins 32 caractères, par exemple :
>   ```bash
>   openssl rand -hex 32
>   ```
> - Ajoutez la valeur à `services/api/.env` :
>   ```
>   DM_JWT_SECRET=6f8d4f0d4bb24e50a8d14bb6b1c8d9b2...
>   ```
> - L’API refusera de démarrer si ce secret est absent ou trop court (pour éviter les tokens falsifiés).

---

### ÉTAPE 3: Installer les dépendances Python

```bash
cd services/api
uv sync
```

---

### ÉTAPE 4: Créer la base de données

```bash
cd services/api

# Créer les tables via SQLAlchemy
uv run python -c "from app.db import Base, engine; Base.metadata.create_all(bind=engine)"

# OU via Alembic si configuré
# uv run alembic upgrade head
```

**Vérification:**
```bash
# Connexion à PostgreSQL
docker exec -it datamortem-postgres psql -U datamortem -d datamortem

# Lister les tables
\dt

# Quitter
\q
```

---

### ÉTAPE 5: Démarrer Celery Worker

**Terminal 1 - Celery Worker:**
```bash
cd services/api
uv run celery -A app.celery_app worker --loglevel=info
```

Vous devriez voir:
```
-------------- celery@hostname v5.4.0
---- **** -----
...
[tasks]
  . app.tasks.index_results.bulk_index_case_results
  . app.tasks.index_results.index_results_task
  . app.tasks.parse_mft.parse_mft_task
```

---

### ÉTAPE 6: Démarrer l'API FastAPI

**Terminal 2 - API:**
```bash
cd services/api
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Vérification:**
```bash
# Health check
curl http://localhost:8080/health

# OpenSearch health
curl http://localhost:8080/api/search/health

# Swagger UI
open http://localhost:8080/docs
```

---

### ÉTAPE 7: Démarrer le Frontend

**Terminal 3 - Frontend:**
```bash
cd frontend

# Installer les dépendances (première fois)
npm install

# Démarrer le dev server
npm run dev
```

Le frontend sera accessible sur **http://localhost:5174**

---

## 🧪 Tester l'intégration complète

### 1. Créer un case de test

```bash
curl -X POST http://localhost:8080/api/cases \
  -H "Content-Type: application/json" \
  -d '{
    "case_id": "case_demo_001",
    "note": "Case de démonstration OpenSearch"
  }'
```

### 2. Créer une evidence (fictive)

```bash
curl -X POST http://localhost:8080/api/evidence \
  -H "Content-Type: application/json" \
  -d '{
    "evidence_uid": "evidence_demo_001",
    "case_id": "case_demo_001",
    "local_path": "/tmp/dummy.raw"
  }'
```

### 3. Simuler un parsing (créer des données de test)

```bash
cd services/api
python test_opensearch.py
```

### 4. Déclencher l'indexation depuis l'API

Supposons que vous avez un TaskRun avec id=1:

```bash
curl -X POST http://localhost:8080/api/indexing/task-run \
  -H "Content-Type: application/json" \
  -d '{
    "task_run_id": 1
  }'
```

### 5. Rechercher dans OpenSearch

```bash
curl -X POST http://localhost:8080/api/search/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "*",
    "case_id": "test_case_001",
    "size": 10
  }' | jq
```

### 6. Voir le résumé d'indexation d'un case

```bash
curl http://localhost:8080/api/indexing/case/test_case_001/summary | jq
```

---

## 🎨 Frontend - Déclencher l'indexation depuis l'UI

Les nouveaux endpoints disponibles pour le frontend:

### Endpoint: Indexer un TaskRun spécifique

```typescript
// POST /api/indexing/task-run
const response = await fetch('http://localhost:8080/api/indexing/task-run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ task_run_id: 123 })
});

const result = await response.json();
// { status: "triggered", message: "...", celery_task_id: "..." }
```

### Endpoint: Indexer tout un case

```typescript
// POST /api/indexing/case
const response = await fetch('http://localhost:8080/api/indexing/case', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    case_id: "case_123",
    force_reindex: false
  })
});
```

### Endpoint: Voir le résumé d'indexation

```typescript
// GET /api/indexing/case/{case_id}/summary
const response = await fetch(
  'http://localhost:8080/api/indexing/case/case_123/summary'
);

const summary = await response.json();
/*
{
  case_id: "case_123",
  task_runs: {
    total: 10,
    success: 8,
    indexable: 8
  },
  opensearch: {
    document_count: 15420,
    index_name: "datamortem-case-case_123"
  }
}
*/
```

### Endpoint: Rechercher

```typescript
// POST /api/search/query
const response = await fetch('http://localhost:8080/api/search/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: "svchost.exe",
    case_id: "case_123",
    from: 0,
    size: 50
  })
});

const results = await response.json();
/*
{
  hits: [...],      // Documents trouvés
  total: 42,        // Total de résultats
  took: 15          // Temps de recherche (ms)
}
*/
```

---

## 📊 Interfaces disponibles

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:5174 | Interface React |
| **API** | http://localhost:8080 | API FastAPI |
| **API Docs** | http://localhost:8080/docs | Swagger UI |
| **OpenSearch** | http://localhost:9200 | API OpenSearch |
| **OpenSearch Dashboards** | http://localhost:5601 | Interface de visualisation |
| **PostgreSQL** | localhost:5432 | Base de données |
| **Redis** | localhost:6379 | Broker Celery |

---

## 🐛 Troubleshooting

### Problème: "Connection refused" PostgreSQL

```bash
# Vérifier que PostgreSQL est up
docker logs datamortem-postgres

# Redémarrer
docker-compose restart postgres
```

### Problème: Celery ne reçoit pas les tâches

```bash
# Vérifier Redis
docker exec datamortem-redis redis-cli ping

# Vérifier la configuration
cd services/api
uv run python -c "from app.config import settings; print(settings.dm_celery_broker)"

# Devrait afficher: redis://localhost:6379/0
```

### Problème: OpenSearch ne démarre pas

```bash
# Vérifier les logs
docker logs datamortem-opensearch

# Vérifier la mémoire allouée
docker stats datamortem-opensearch

# Augmenter la mémoire si besoin (modifier docker-compose.yml)
# OPENSEARCH_JAVA_OPTS=-Xms1g -Xmx1g
```

### Problème: API ne se connecte pas à OpenSearch

```bash
# Tester depuis l'API
cd services/api
uv run python -c "
from app.opensearch.client import get_opensearch_client, test_connection
from app.config import settings
client = get_opensearch_client(settings)
print(test_connection(client))
"
```

---

## 📝 Logs

Les logs sont dans le répertoire `logs/`:

```bash
# API
tail -f logs/api.log

# Celery Worker
tail -f logs/celery-worker.log

# Frontend
tail -f logs/frontend.log

# Docker services
docker-compose logs -f opensearch
docker-compose logs -f postgres
docker-compose logs -f redis
```

---

## 🔄 Workflow complet

1. **L'utilisateur crée un case** via le frontend
2. **L'utilisateur upload une evidence** (image disque)
3. **L'utilisateur lance des parsers** (MFT, Prefetch, Registry...)
4. **Les parsers s'exécutent via Celery** et produisent des résultats (CSV/Parquet)
5. **L'utilisateur clique sur "Indexer"** dans le frontend
6. **L'API déclenche la tâche d'indexation** (Celery)
7. **Le worker lit les résultats et les indexe dans OpenSearch**
8. **L'utilisateur peut rechercher** dans les événements via l'interface
9. **L'utilisateur peut créer des règles** de détection
10. **L'utilisateur exporte une timeline** pour le rapport

---

## 🎓 Prochaines étapes

- [ ] Créer des composants React pour la recherche
- [ ] Ajouter un bouton "Indexer" dans PipelineView
- [ ] Créer une vue Explorer pour la recherche
- [ ] Implémenter le système de règles
- [ ] Ajouter l'export de timeline
- [ ] Créer des dashboards OpenSearch personnalisés

---

## 📚 Documentation API

Tous les endpoints sont documentés dans Swagger UI:

**http://localhost:8080/docs**

Sections:
- **cases** - Gestion des investigations
- **evidence** - Gestion des preuves
- **pipeline** - Orchestration des parsers
- **indexing** - ✨ Nouveau: Déclenchement de l'indexation
- **search** - ✨ Nouveau: Recherche dans OpenSearch

---

Vous avez maintenant une stack complète fonctionnelle! 🎉
