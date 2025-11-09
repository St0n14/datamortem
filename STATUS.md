# ✅ Stack dataMortem - Statut Opérationnel

**Date:** 2025-11-06 12:05
**Status:** ✅ STACK OPERABLE EN LOCAL (LB + marketplace, quotas)

---

## 🆕 Changements récents

- ✅ **Sécurité API** : RBAC complet (ownership cases/évidences) + endpoints protégés.
- ✅ **Quotas utilisateurs** : un seul case pour les analystes, limite de 20 Go sur les evidences (admins exemptés).
- ✅ **Scripts personnalisés & marketplace** : stockage + exécution Python pour admins, marketplace consultable par tous, assignation contrôlée via un admin.
- ✅ **Durcissement scripts** : endpoints admin-only, noms sanitizés, exécution localisée pending sandbox.
- ✅ **Load balancing local** : Traefik devant plusieurs réplicas FastAPI, frontend/config adaptés (`http://localhost:8080`).
- ✅ **Tests de charge** : scripts k6 (`load-tests/`) pour valider la montée en charge avant industrialisation.
- ✅ Config centralisée via `.env`, Explorer moderne, timeline qui se réinitialise correctement.

---

## 🚀 Services en cours d'exécution

| Service | Status | Port | PID |
|---------|--------|------|-----|
| **PostgreSQL** | ✅ Running | 5432 | Docker |
| **Redis** | ✅ Running | 6379 | Docker |
| **OpenSearch** | ✅ Running | 9200 | Docker |
| **OpenSearch Dashboards** | ✅ Running | 5601 | Docker |
| **Traefik (LB)** | ✅ Running | 8080 | Docker |
| **API FastAPI** | ✅ Running | interne 8000 (via Traefik) | Voir api.pid |
| **Celery Worker** | ✅ Running | - | Voir celery-worker.pid |

---

## 📊 Vérifications effectuées

- ✅ PostgreSQL: Tables créées avec succès
- ✅ Redis: Connexion OK
- ✅ OpenSearch: Version 2.17.0, Cluster GREEN
- ✅ API FastAPI: Health check OK
- ✅ Celery Worker: 3 tâches chargées
- ✅ Intégration OpenSearch: Tests passent
- ✅ Endpoints API: Fonctionnels

---

## 🌐 URLs disponibles

### Application
- **Frontend**: http://localhost:5174
- **API (via Traefik)**: http://localhost:8080
- **API Docs (Swagger)**: http://localhost:8080/docs

### Services
- **OpenSearch**: http://localhost:9200
- **OpenSearch Dashboards**: http://localhost:5601
- **PostgreSQL**: localhost:5432 (user: datamortem, db: datamortem)
- **Redis**: localhost:6379

---

## 🎯 Endpoints API clés

### Indexation (Nouveaux!)
```bash
# Indexer un TaskRun spécifique
POST /api/indexing/task-run
Body: { "task_run_id": 123 }

# Indexer tout un case
POST /api/indexing/case
Body: { "case_id": "case_123", "force_reindex": false }

# Résumé d'indexation d'un case
GET /api/indexing/case/{case_id}/summary

# Status d'une tâche
GET /api/indexing/status/{task_run_id}
```

### Recherche OpenSearch (Nouveaux!)
```bash
# Recherche simple
POST /api/search/query
Body: { "query": "svchost.exe", "case_id": "case_123", "size": 50 }

# Agrégations
POST /api/search/aggregate
Body: { "case_id": "case_123", "field": "event.type", "size": 10 }

# Timeline
POST /api/search/timeline
Body: { "case_id": "case_123", "interval": "1h" }

# Statistiques d'index
GET /api/search/stats/{case_id}

# Santé OpenSearch
GET /api/search/health
```

### Cases, Evidence, Pipeline (Existants + CRUD)
- POST /api/cases - Créer un case
- GET /api/cases - Lister les cases
- GET /api/cases/{case_id} - Détail d’un case
- PATCH /api/cases/{case_id} - Mettre à jour note ou status
- DELETE /api/cases/{case_id} - Supprimer un case (cascade sur evidences/task runs)
- POST /api/evidence - Ajouter une evidence
- POST /api/pipeline/run - Lancer un parser

---

## 🧪 Tester l'intégration

### 1. Créer un case
```bash
curl -X POST http://localhost:8080/api/cases \
  -H "Content-Type: application/json" \
  -d '{"case_id": "test_001", "note": "Test case"}'
```

### 2. Vérifier la santé OpenSearch
```bash
curl http://localhost:8080/api/search/health | jq
```

### 3. Voir le résumé d'indexation
```bash
curl http://localhost:8080/api/indexing/case/test_001/summary | jq
```

---

## 📝 Logs

Les logs sont disponibles dans le répertoire `logs/`:

```bash
# API
tail -f logs/api.log

# Celery Worker
tail -f logs/celery-worker.log

# Services Docker
docker-compose logs -f opensearch
docker-compose logs -f postgres
docker-compose logs -f redis
```

---

## 🛑 Arrêter la stack

### Arrêt complet (script)
```bash
./stop-stack.sh
```

### Arrêt manuel
```bash
# Arrêter API et Celery
kill $(cat api.pid)
kill $(cat celery-worker.pid)

# Arrêter Docker
docker-compose down
```

---

## 🎨 Intégration Frontend

Pour déclencher l'indexation depuis React:

```typescript
// Exemple: Bouton "Indexer" dans PipelineView
const handleIndex = async (taskRunId: number) => {
  const response = await fetch('http://localhost:8080/api/indexing/task-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_run_id: taskRunId })
  });

  const result = await response.json();

  if (result.status === 'triggered') {
    alert(`Indexation démarrée! Celery Task: ${result.celery_task_id}`);
  }
};

// Exemple: Recherche
const handleSearch = async (caseId: string, query: string) => {
  const response = await fetch('http://localhost:8080/api/search/query', {
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

## 🔧 Configuration

### Fichiers de configuration
- **API**: `services/api/.env`
- **Docker**: `docker-compose.yml`

### Variables d'environnement importantes
```env
DM_ENV=development
DM_DB_URL=postgresql://datamortem:datamortem_dev_password@localhost:5432/datamortem
DM_CELERY_BROKER=redis://localhost:6379/0
DM_CELERY_BACKEND=redis://localhost:6379/1
DM_OPENSEARCH_HOST=localhost
DM_OPENSEARCH_PORT=9200
```

---

## 📚 Documentation

- **Guide rapide**: `QUICK_START.md`
- **Guide complet**: `STACK_SETUP.md`
- **Tests OpenSearch**: `services/api/OPENSEARCH_TESTING.md`
- **API Interactive**: http://localhost:8080/docs

---

## ✅ Prochaines étapes

1. **Frontend**: Ajouter des boutons "Indexer" dans PipelineView
2. **Frontend**: Créer une vue "Explorer" pour la recherche
3. **Frontend**: Afficher les statistiques d'indexation
4. **Backend**: Chaînage automatique parsing → indexation
5. **Backend**: Système de règles de détection
6. **Frontend**: Pagination/virtualisation timeline quand on activera la pagination OpenSearch

---

**La stack est prête à être utilisée!** 🎉

Pour toute question, consultez la documentation ou les logs.

## 📈 Tests de montée en charge

- Scripts k6 dans `load-tests/` (`health-smoke.js`, `search-health-throughput.js`)
- Exemple : `k6 run load-tests/health-smoke.js` (configurable via `API_BASE_URL`, `VUS`, etc.)
- Sert à valider Traefik + scaling (`docker-compose up -d --scale api=2`)

---

## ✅ Travail réalisé

1. **Sécurisation backend**
   - Auth JWT + RBAC par case/évidence/pipeline/indexing
   - Routes publiques verrouillées, artefacts confinés à `/lake`
2. **Scripts custom & pipeline**
   - CRUD des scripts (Python/Perl/Rust), exécution Celery + stockage output
   - UI Scripts pour création, copie, exécution ciblée
3. **Load balancing local**
   - Traefik ajouté à docker-compose, front/config pointent vers `:8080`
   - Docs/scripts mis à jour (`start-stack.sh`, `STACK_SETUP.md`)
4. **Outils de test**
   - Scripts k6 + documentation pour montée en charge locale
   - Guide pour scaler API/workers avec `docker-compose`

---

- **New Case button** : au besoin, le 1ᵉʳ case peut désormais être créé via l’UI (bouton “Create first case”), sinon un admin doit le faire.
- **⚠️ Migrations DB** : appliquer les colonnes `task_run.script_id`, `custom_scripts.is_approved`, `user_scripts` avant production (cf. instructions DB).

---

## 🔜 Reste à faire

- [ ] Externaliser `/lake` (S3/GCS ou volume partagé) pour préparer le multi-nœuds.
- [ ] Passer Postgres/Redis/OpenSearch en services managés ou multi-nœuds.
- [ ] Définir l’orchestrateur cible (GKE/Cloud Run/Swarm) + ingress prod.
- [ ] Ajouter du monitoring (Prometheus/Grafana ou Cloud Monitoring) + alertes.
- [ ] Finaliser la montée en charge (CI/CD, Terraform/Helm) une fois les choix infra validés.
- [ ] ⚠️ Sandbox scripts custom avant déploiement GCP (conteneur dédié, montages read-only). Bloquer la fonctionnalité si sandbox absent.
