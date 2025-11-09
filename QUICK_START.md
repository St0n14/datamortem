# 🚀 Démarrage Rapide - dataMortem Stack Complète

## ⚡ TL;DR - 3 commandes

```bash
# 1. Démarrer la stack
./start-stack.sh

# 2. Attendre 30 secondes

# 3. Ouvrir le navigateur
open http://localhost:5174  # Frontend
open http://localhost:8080/docs  # API Docs
```

---

## 🔐 Avant de lancer : définir `DM_JWT_SECRET`

- Copiez `services/api/.env.example` vers `services/api/.env` si ce n’est pas déjà fait.
- Générez un secret aléatoire d’au moins 32 caractères :
  ```bash
  openssl rand -hex 32
  ```
- Ajoutez la ligne suivante dans `services/api/.env` :
  ```
  DM_JWT_SECRET=6f8d4f0d4bb24e50a8d14bb6b1c8d9b2...
  ```
- Sans cette valeur, l’API refusera de démarrer (sécurité JWT).

---

## 📦 Ce qui est démarré

✅ PostgreSQL (base de données)
✅ Redis (queue de tâches)
✅ OpenSearch (indexation & recherche)
✅ OpenSearch Dashboards (visualisation)
✅ API FastAPI (backend)
✅ Celery Worker (exécution des parsers)
✅ Frontend React (interface)

---

## 🔗 URLs importantes

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:5174 |
| **API Docs** | http://localhost:8080/docs |
| **OpenSearch Dashboards** | http://localhost:5601 |

---

## 🎯 Comment déclencher l'indexation depuis le frontend

### Option 1: Via l'interface (TODO - à implémenter)

1. Créer un case
2. Uploader une evidence
3. Lancer des parsers
4. Cliquer sur **"Indexer dans OpenSearch"**
5. Rechercher dans les événements

### Option 2: Via API (disponible maintenant)

```bash
# Indexer les résultats d'un TaskRun spécifique
curl -X POST http://localhost:8080/api/indexing/task-run \
  -H "Content-Type: application/json" \
  -d '{"task_run_id": 1}'

# Indexer tout un case
curl -X POST http://localhost:8080/api/indexing/case \
  -H "Content-Type: application/json" \
  -d '{"case_id": "case_123"}'

# Voir le résumé d'indexation
curl http://localhost:8080/api/indexing/case/case_123/summary | jq

# Rechercher dans les événements
curl -X POST http://localhost:8080/api/search/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "svchost.exe",
    "case_id": "case_123",
    "size": 10
  }' | jq
```

---

## 🛑 Arrêter la stack

```bash
./stop-stack.sh
```

---

## 🐛 Problème ?

### La stack ne démarre pas

```bash
# Vérifier Docker
docker-compose ps

# Voir les logs
docker-compose logs opensearch
docker-compose logs postgres
docker-compose logs redis
```

### OpenSearch ne répond pas

```bash
# Attendre 30-60 secondes après le démarrage
# Vérifier manuellement
curl http://localhost:9200
```

### L'API ne se connecte pas

```bash
# Vérifier les logs
tail -f logs/api.log

# Vérifier la config
cat services/api/.env
```

---

## 📖 Documentation complète

Voir `STACK_SETUP.md` pour:
- Démarrage manuel étape par étape
- Intégration frontend détaillée
- Troubleshooting avancé
- Exemples de code TypeScript

---

## ✅ Tester que tout fonctionne

```bash
# 1. Health check API
curl http://localhost:8080/health

# 2. Health check OpenSearch
curl http://localhost:8080/api/search/health

# 3. Créer des données de test et indexer
cd services/api
python test_opensearch.py

# 4. Rechercher dans les données de test
curl -X POST http://localhost:8080/api/search/query \
  -H "Content-Type: application/json" \
  -d '{"query": "svchost.exe", "case_id": "test_case_001", "size": 5}' | jq
```

Si tout affiche "OK" ou "✅", la stack fonctionne! 🎉

---

## 🎨 Intégrer au Frontend

Nouveau router créé: `/api/indexing`

**Endpoints disponibles:**

```typescript
// Indexer un TaskRun
POST /api/indexing/task-run
Body: { task_run_id: number }

// Indexer un case complet
POST /api/indexing/case
Body: { case_id: string, force_reindex?: boolean }

// Résumé d'indexation d'un case
GET /api/indexing/case/{case_id}/summary

// Rechercher dans les événements
POST /api/search/query
Body: { query: string, case_id: string, size?: number }

// Agrégations
POST /api/search/aggregate
Body: { case_id: string, field: string, size?: number }

// Timeline
POST /api/search/timeline
Body: { case_id: string, interval: string }
```

Exemple d'intégration React:

```tsx
// Bouton pour indexer
const handleIndex = async (taskRunId: number) => {
  const response = await fetch('/api/indexing/task-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_run_id: taskRunId })
  });

  const result = await response.json();
  console.log('Indexation déclenchée:', result);
};

// Recherche
const handleSearch = async (caseId: string, query: string) => {
  const response = await fetch('/api/search/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      case_id: caseId,
      size: 50
    })
  });

  const results = await response.json();
  setSearchResults(results.hits);
};
```

---

Vous êtes prêt! 🚀
