# Session de Travail - Requiem

## Résumé des Modifications

### 🎯 Objectifs accomplis

1. ✅ **Refactoring du frontend** - App.tsx nettoyé (870 → 386 lignes)
2. ✅ **Sécurisation de l'API** - `/events/ingest` réservé aux admins
3. ✅ **Indexation OpenSearch** - Tous les événements ingérés vont maintenant dans OpenSearch
4. ✅ **Makefile complet** - Automatisation du workflow de développement
5. ✅ **Mode démo fonctionnel** - Reset + ingestion de données en une commande

---

## 1. Refactoring Frontend

### Composants créés

**📁 `frontend/src/components/layout/`**
- `Sidebar.tsx` - Navigation latérale (150 lignes)
- `EventInspector.tsx` - Panneau de détails d'événement (75 lignes)

**📁 `frontend/src/components/timeline/`**
- `TimelineSearchBar.tsx` - Barre de recherche (85 lignes)
- `TimelineCard.tsx` - Chart de timeline (160 lignes)
- `EventsTable.tsx` - Tableau des événements (130 lignes)

**📁 `frontend/src/components/`**
- `CaseIndexingSummary.tsx` - Widget d'indexation (60 lignes)
- `EmptyCaseView.tsx` - Message sans case (30 lignes)

### Résultat
- **App.tsx** : 870 → 386 lignes (-56%)
- Code plus maintenable et réutilisable
- Aucune régression fonctionnelle

---

## 2. Sécurisation de l'API

### Endpoint `/api/events/ingest`

**Avant :**
```python
# Accessible à tous les utilisateurs authentifiés
@router.post("/events/ingest")
def ingest_events(current_user: User = Depends(get_current_active_user)):
    ...
```

**Après :**
```python
# Vérifie que l'utilisateur est admin
if not is_admin_user(current_user):
    raise HTTPException(403, "Event ingestion is restricted to administrators only")
```

### Tests de sécurité
- ✅ Admin peut ingérer : `200 OK`
- ✅ User régulier bloqué : `403 Forbidden`
- ✅ Anonyme refusé : `401 Unauthorized`

---

## 3. Indexation OpenSearch

### Problème identifié
L'endpoint `/events/ingest` n'indexait **que dans PostgreSQL**, pas dans OpenSearch.
→ Les événements n'apparaissaient pas dans la Timeline/Explorer

### Solution implémentée

**Nouvelle fonction** `indexer.py:index_events_batch()`
```python
def index_events_batch(client: OpenSearch, events: List[Dict], case_id: str):
    """
    Indexe une liste d'événements directement dans OpenSearch.
    Utilisé par l'endpoint /events/ingest.
    """
```

**Modification de `/events/ingest`**
```python
# 1. Insertion PostgreSQL (comme avant)
db.add_all(new_objs)
db.commit()

# 2. NOUVEAU: Indexation OpenSearch
client = get_opensearch_client(settings)
stats = index_events_batch(client, events, case_id, case_name)
```

**Résultat :**
```json
{
  "ok": true,
  "ingested": 2,
  "opensearch": {
    "TEST": {
      "indexed": 2,
      "failed": 0,
      "errors": [],
      "total_events": 2
    }
  }
}
```

### Fix bonus
- Conversion automatique des noms d'index en lowercase : `TEST` → `test`
- Structure ECS pour les documents OpenSearch

---

## 4. Makefile Complet

### Commandes principales

```bash
make help           # Liste toutes les commandes
make all            # Tests + lance la stack
make demo           # ⚠️ Reset + start + 2000 événements
make status         # État des services
make logs           # Logs en temps réel
make test           # Tests de santé
```

### Workflow de `make demo`

1. **Clean** : `docker-compose down -v` (supprime volumes)
2. **Start** : `docker-compose up -d`
3. **Wait** : 30s pour services prêts
4. **Init Admin** : Crée utilisateur `admin/admin123`
5. **Ingest** : 2000 événements de démo

**Types d'événements générés :**
- PROCESS_CREATE
- NETWORK_CONNECTION
- FILE_WRITE
- REGISTRY_SET

**Tags MITRE ATT&CK :**
- execution, initial_access, lateral_movement
- collection, exfiltration

### Script d'ingestion

**`scripts/demo_data.sh`**
- S'exécute **dans le container API** (via `docker-compose exec`)
- Utilise l'environnement `uv` avec toutes les dépendances
- URL interne : `http://traefik:8080`
- Paramétrable via variables d'environnement

```bash
DEMO_CASE=my_case DEMO_EVENTS=5000 make demo-data
```

---

## 5. Tests et Validation

### Script de test complet

**`scripts/test_ingestion_complete.py`**
- Teste PostgreSQL ET OpenSearch
- Crée case + evidence
- Ingère N événements
- Vérifie la cohérence des deux bases

### Flux validé

```
/api/events/ingest
    ↓
PostgreSQL (table Event) ✅
    +
OpenSearch (index requiem-case-*) ✅
    ↓
Timeline / Explorer ✅
```

**Test effectué :**
```bash
Ingéré: 100 événements
PostgreSQL: ✅ 100 événements
OpenSearch: ✅ 100 événements
```

---

## 6. Endpoints Ajoutés

### Health Check Public

**`GET /api/health`** (sans authentification)
```json
{
  "status": "healthy",
  "service": "requiem-api",
  "message": "API is running"
}
```

Utilisé par le Makefile pour attendre que l'API soit prête.

---

## Utilisation

### Démarrage rapide
```bash
# Voir les commandes disponibles
make help

# Lancer avec tests
make all

# Mode démo (⚠️ supprime les données)
make demo

# Accéder à l'interface
make frontend
# Login: admin / admin123
```

### Développement
```bash
# Démarrer
make up

# Logs en temps réel
make logs SERVICE=api

# Vérifier OpenSearch
make check-opensearch

# Shell dans l'API
make shell-api
```

### Tests
```bash
# Test rapide
make test

# Test d'ingestion complet
make test-ingestion

# Ingérer des données custom
DEMO_CASE=my_case DEMO_EVENTS=1000 make demo-data
```

---

## Structure des Fichiers Modifiés/Créés

```
requiem/
├── Makefile                          # ✨ NOUVEAU
├── MAKEFILE.md                       # ✨ NOUVEAU - Documentation
├── README_SESSION.md                 # ✨ NOUVEAU - Ce fichier
│
├── frontend/src/
│   ├── App.tsx                       # ♻️ REFACTORÉ (870 → 386 lignes)
│   ├── components/
│   │   ├── layout/                   # ✨ NOUVEAU
│   │   │   ├── Sidebar.tsx
│   │   │   └── EventInspector.tsx
│   │   ├── timeline/                 # ✨ NOUVEAU
│   │   │   ├── TimelineSearchBar.tsx
│   │   │   ├── TimelineCard.tsx
│   │   │   └── EventsTable.tsx
│   │   ├── CaseIndexingSummary.tsx   # ✨ NOUVEAU
│   │   └── EmptyCaseView.tsx         # ✨ NOUVEAU
│
├── services/api/app/
│   ├── routers/
│   │   ├── events.py                 # 🔒 SÉCURISÉ + 🔄 INDEXATION OS
│   │   └── health.py                 # ✨ ENDPOINT PUBLIC
│   ├── opensearch/
│   │   ├── indexer.py                # ✨ index_events_batch()
│   │   └── index_manager.py          # 🐛 FIX lowercase
│
└── scripts/
    ├── demo_data.sh                  # ✨ NOUVEAU - Wrapper Docker
    ├── demo_data.py                  # 🐛 FIX indentation
    └── test_ingestion_complete.py    # ✨ NOUVEAU - Tests
```

---

## Améliorations Futures

### Court terme
- [ ] Ajouter des métriques Prometheus
- [ ] Implémenter le filtrage dans TimelineSearchBar
- [ ] Export CSV fonctionnel
- [ ] Tests unitaires pour les composants React

### Moyen terme
- [ ] Authentification SSO
- [ ] Rôles utilisateurs avancés
- [ ] Alertes temps réel
- [ ] Dashboard d'analyse

### Long terme
- [ ] ML pour détection d'anomalies
- [ ] Plugin system pour parsers custom
- [ ] Multi-tenancy
- [ ] API GraphQL

---

## Notes Techniques

### Pourquoi le script s'exécute dans le container ?
Le script Python nécessite `requests` et d'autres dépendances. Au lieu d'installer sur la machine hôte, on exécute dans le container API qui a déjà tout.

### Pourquoi `http://traefik:8080` ?
Depuis l'intérieur du réseau Docker, `localhost:8080` ne fonctionne pas. On utilise le nom du service Traefik.

### Pourquoi lowercase pour les index ?
OpenSearch rejette les noms d'index avec majuscules. La conversion automatique évite les erreurs.

---

## Commandes Utiles

```bash
# Voir tous les indices OpenSearch
curl http://localhost:9200/_cat/indices?v

# Compter les événements d'un case
curl http://localhost:9200/requiem-case-CASE_ID/_count

# Voir un événement
curl http://localhost:9200/requiem-case-CASE_ID/_search?size=1

# Réindexer tous les events d'un case
curl -X POST http://localhost:8080/api/indexing/cases/CASE_ID/reindex \
  -H "Authorization: Bearer TOKEN"

# Créer un utilisateur admin
docker-compose exec -T api uv run python -m app.init_admin
```

---

## Problèmes Résolus

1. ✅ App.tsx trop volumineux → Refactoring en composants
2. ✅ `/events/ingest` accessible à tous → Restriction admin
3. ✅ Events pas dans OpenSearch → Indexation automatique
4. ✅ Workflow manuel complexe → Makefile automatisé
5. ✅ Pas de données de test → `make demo`
6. ✅ Index OpenSearch en majuscules → Conversion lowercase
7. ✅ Script Python sans dépendances → Exécution dans container

---

**Session terminée avec succès** ✨
