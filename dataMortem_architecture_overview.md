# Requiem - Architecture Overview

## 🎯 Vision du Projet

Requiem est une plateforme d'analyse forensique d'hôte combinant :
- La puissance d'exploration d'**OpenSearch**
- La capacité de règles et timeline de **Timesketch**
- L'orchestration DFIR avec support multi-langages

---

## 📐 Architecture Globale

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND LAYER                            │
│                     (React + Vite)                               │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐ │
│  │ Case Manager │  Parser UI   │  Explorer    │  Timeline    │ │
│  │              │              │  (Search)    │  (Rules)     │ │
│  └──────────────┴──────────────┴──────────────┴──────────────┘ │
└────────────────────────┬────────────────────────────────────────┘
                         │ REST API / WebSocket
┌────────────────────────┴────────────────────────────────────────┐
│                       API LAYER                                  │
│                 (Django + FastAPI)                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  API Endpoints:                                           │  │
│  │  • Case Management    • Parser Registry                  │  │
│  │  • Task Orchestration • Search Proxy (OpenSearch)        │  │
│  │  • Results Retrieval  • Timeline & Rules Engine          │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   REDIS     │  │  PostgreSQL │  │ OpenSearch  │
│  (Broker)   │  │   (Meta)    │  │  (Search)   │
└──────┬──────┘  └─────────────┘  └──────▲──────┘
       │                                   │
       │ Tasks Queue                       │ Indexation
       ▼                                   │
┌─────────────────────────────────────────┴───────┐
│              WORKER LAYER (Celery)              │
│  ┌──────────────────────────────────────────┐  │
│  │         Task Orchestrator                │  │
│  │  • Gestion du cycle de vie des parsers   │  │
│  │  • Build à la volée (Go/Rust)            │  │
│  │  • Monitoring & retry logic              │  │
│  └──────────────┬───────────────────────────┘  │
│                 │                                │
│     ┌───────────┼───────────┐                  │
│     ▼           ▼           ▼                  │
│  ┌─────┐   ┌─────┐   ┌─────────┐              │
│  │Python│   │ Go  │   │  Rust   │              │
│  │Parser│   │Parser   │ Parser  │              │
│  └───┬──┘   └──┬──┘   └────┬────┘              │
└──────┼─────────┼───────────┼────────────────────┘
       │         │           │
       └─────────┴───────────┘
              │ Parquet/JSON
              ▼
       ┌─────────────┐
       │   STORAGE   │
       │  (S3/Local) │
       └──────┬──────┘
              │
              │ Ingestion Pipeline
              ▼
       ┌─────────────┐
       │ OpenSearch  │
       │  Indexing   │
       └─────────────┘
```

---

## 🔧 Composants Clés

### 1. **Frontend Layer (React + Vite)**

**Rôle :** Interface utilisateur pour les analystes forensiques

**Modules :**
- **Case Manager** : Création et gestion des investigations
- **Parser UI** : Sélection, configuration et lancement des parsers
- **Explorer** : Interface de recherche OpenSearch (type Kibana simplifié)
- **Timeline** : Visualisation temporelle avec système de règles

### 2. **API Layer (FastAPI)**

**Rôle :** Orchestration et exposition des services

**Responsabilités :**
- Authentification JWT avec support OTP/2FA (TOTP)
- RBAC (superadmin, admin, analyst, viewer) avec permissions granulaires
- Gestion des cases (investigations) avec ownership
- Registry des parsers disponibles (AnalysisModule)
- Marketplace de scripts custom Python avec installation/exécution isolée
- Déclenchement des tâches Celery
- Proxy vers OpenSearch avec recherche, agrégations, timeline
- Gestion des utilisateurs avec email verification optionnelle
- Quotas utilisateurs (analysts: 1 case, 20GB evidences)

**Technologies :**
- FastAPI : Framework REST moderne avec validation Pydantic
- SQLAlchemy 2.x : ORM avec PostgreSQL
- bcrypt : Password hashing sécurisé
- PyJWT : Tokens JWT avec expiration 24h
- pyotp : TOTP pour authentification 2FA
- opensearch-py : Client OpenSearch officiel

### 3. **Message Broker (Redis)**

**Rôle :** Queue de tâches pour Celery

**Usage :**
- Distribution des jobs de parsing
- Gestion de la priorité des tâches
- Cache pour les résultats intermédiaires

### 4. **Metadata Store (PostgreSQL)**

**Rôle :** Stockage des métadonnées

**Contenu :**
- **Users** : Comptes utilisateurs avec hashed passwords, OTP secrets, email verification tokens
- **Cases** : Investigations avec ownership, status, notes markdown, liens HedgeDoc
- **Evidences** : Artefacts forensiques avec chemins stockage, métadonnées
- **AnalysisModule** : Registry des parsers (nom, description, tool, enabled)
- **TaskRun** : Historique d'exécutions (status, timestamps, output paths, error messages)
- **CustomScript** : Scripts marketplace (Python code, requirements, approval status)
- **UserScript** : Table de liaison installations utilisateurs
- **Events** : Événements bruts avant indexation OpenSearch (optionnel)

**Modèle User :**
- Champs auth : email, username, hashed_password
- RBAC : role (superadmin/admin/analyst/viewer), is_active, is_superuser
- OTP/2FA : otp_enabled, otp_secret
- Email verification : email_verified, email_verification_token, email_verification_sent_at
- Audit : created_at_utc, last_login_utc

### 5. **Worker Layer (Celery)**

**Rôle :** Exécution distribuée des parsers et scripts

**Fonctionnalités :**
- **Parsers natifs** : Exécution de modules d'analyse (MFT, EVTx, Registry...)
- **Scripts custom** : Isolation complète dans virtualenv dédié par script
- **Monitoring** : Progression, logs, erreurs dans TaskRun
- **Resilience** : Retry automatique (max_retries=3), timeout
- **Stockage organisé** : `/lake/{case_id}/{evidence_uid}/{parser_name}/`

**Types de tâches actuellement implémentées :**
- `parse_mft_task` : Parser Master File Table Windows
- `sample_long_task` : Test de tâche longue durée
- `generate_test_events` : Génération d'événements de test
- `parse_with_dissect` : Parser générique Dissect
- `dissect_extract_mft` : MFT via Dissect Target
- `run_custom_script` : Exécution de scripts marketplace dans venv isolé
- `index_results_task` : Indexation Parquet/CSV/JSONL vers OpenSearch

**Isolation scripts custom :**
- Répertoire dédié : `/lake/{case_id}/{evidence_uid}/scripts/{script_name}_{id}/`
- Virtualenv Python dédié : `python -m venv venv/`
- Installation dépendances isolée : `pip install -r requirements.txt`
- Variables d'environnement injectées : `CASE_ID`, `EVIDENCE_UID`, `EVIDENCE_PATH`, `OUTPUT_DIR`
- Capture stdout/stderr dans `output.txt`

### 6. **Parsers (Multi-langages)**

**Rôle :** Extraction et normalisation des artefacts

**Caractéristiques :**
- **Standalone** : Chaque parser est autonome
- **Multi-formats** : Input varié (logs, registry, mémoire...)
- **Output standardisé** : Parquet (stockage) + JSON (indexation)

**Structure output :**
```json
{
  "@timestamp": "2024-11-05T10:30:00Z",
  "source.parser": "prefetch_parser",
  "event.type": "process",
  "host.id": "case_123_host_01",
  "case.id": "case_123",
  // Champs spécifiques au parser...
}
```

### 7. **Storage Layer**

**Rôle :** Persistance des résultats bruts et artefacts forensiques

**Configuration actuelle :**
- Stockage local : `/lake` (volume Docker `lake-data`)
- TODO : Support S3/GCS pour multi-nœuds (prod)

**Organisation hiérarchique :**
```
/lake
  /{case_id}
    /{evidence_uid}
      /raw/                           # Artefacts originaux uploadés
        - disk.E01
        - memory.dump
      /mft/                           # Résultats parser MFT
        - results.parquet
        - output.txt
      /evtx/                          # Résultats parser EVTx
        - results.parquet
      /scripts/                       # Scripts custom
        /{script_name}_{id}/
          - script.py
          - requirements.txt
          - venv/
          - output.txt
```

**Formats supportés :**
- **Input** : E01, raw, VMDK, memory dumps, logs, registry hives
- **Output parsers** : Parquet (préféré), CSV, JSONL
- **Scripts custom** : Format libre dans OUTPUT_DIR

### 8. **OpenSearch Cluster**

**Rôle :** Indexation et recherche des événements forensiques

**Configuration :**
- **Version** : OpenSearch 2.17.0
- **Index pattern** : `requiem-case-{case_id}` (un index par case)
- **Mapping hybride** : Champs communs stricts + dynamic templates pour champs spécifiques
- **Retention** : Par case (suppression quand case clôturé ou via API)
- **Sharding** : 1 shard (dev), 3+ shards (prod)
- **Replicas** : 0 (dev), 1+ (prod)
- **Bulk indexing** : 500 documents par batch

**Champs communs (ECS-inspired) :**
```json
{
  "@timestamp": "date",           // Requis, normalisé ISO8601
  "case": {
    "id": "keyword",
    "name": "keyword"
  },
  "evidence": {
    "uid": "keyword"
  },
  "source": {
    "parser": "keyword"           // Ex: "parse_mft", "custom_script_X"
  },
  "event": {
    "type": "keyword",            // Ex: "process", "network", "file"
    "category": "keyword"
  },
  "host": {
    "id": "keyword",
    "hostname": "keyword"
  },
  "user": {
    "name": "keyword"
  },
  "message": "text",              // Full-text search
  "tags": "keyword[]",
  "score": "integer",             // Priorité/severity
  "indexed_at": "date",           // Metadata indexation
  "raw": "text"                   // Données brutes optionnelles
}
```

**API Endpoints OpenSearch :**
- `POST /api/search/query` : Recherche full-text avec filtres
- `POST /api/search/aggregate` : Agrégations (terms, date_histogram...)
- `POST /api/search/timeline` : Timeline d'événements avec intervalle
- `GET /api/search/stats/{case_id}` : Statistiques index (doc count, size, parsers)
- `GET /api/search/health` : Santé cluster OpenSearch

**Features :**
- Full-text search sur champ `message`
- Filtres multiples (event.type, tags, host.id...)
- Agrégations pour analytics (top hosts, event types, timeline)
- Pagination (from/size)
- Sort personnalisé

### 9. **Système d'authentification & RBAC**

**Authentification JWT :**
- Tokens JWT signés avec HS256 (secret min 32 chars)
- Expiration : 24 heures
- Payload : user ID, username, email, role
- Header `Authorization: Bearer {token}` pour tous les endpoints protégés

**OTP/2FA (TOTP) :**
- Activation optionnelle par utilisateur (DM_ENABLE_OTP=true)
- Secret généré avec `pyotp.random_base32()`
- QR code affiché dans l'UI pour scan (Google Authenticator, Microsoft Authenticator, 1Password...)
- Code requis au login si OTP activé
- Fenêtre de validation : ±30 secondes (standard TOTP)
- Désactivation nécessite un code valide

**Email Verification (optionnelle) :**
- Configuration : DM_ENABLE_EMAIL_VERIFICATION=true
- Token unique généré à l'inscription (`secrets.token_urlsafe(32)`)
- Email envoyé avec lien de vérification
- Login bloqué jusqu'à vérification si activé
- Renvoi de lien disponible

**RBAC - 4 rôles hiérarchiques :**

1. **superadmin** (`is_superuser=True`)
   - Gestion complète du système
   - CRUD utilisateurs avec assignation de rôles
   - Gestion marketplace : création, approbation, assignation scripts
   - Import scripts depuis GitHub
   - Accès total à tous les cases
   - Pas de quotas

2. **admin**
   - Accès lecture/écriture à tous les cases
   - Exécution de tous les parsers et scripts
   - Voir statistiques système
   - Pas de gestion utilisateurs ni marketplace
   - Pas de quotas

3. **analyst** (rôle par défaut)
   - Crée et gère uniquement ses propres cases
   - Upload evidences et exécution parsers
   - Installation scripts depuis marketplace
   - **Quotas** : 1 case actif max, 20GB evidences max
   - Pas d'accès aux cases d'autres utilisateurs

4. **viewer** (lecture seule)
   - Lecture sur cases assignés uniquement
   - Pas de création/modification
   - Pas d'exécution de parsers/scripts

**Permissions vérifiées sur chaque endpoint :**
- Ownership check : `case.owner_id == user.id` (sauf admins)
- Role check : `user.role in ["admin", "superadmin"]`
- Dependencies FastAPI : `get_current_active_user`, `get_current_admin_user`, `get_current_superadmin_user`

### 10. **Marketplace de scripts**

**Architecture :**
- Scripts Python stockés dans PostgreSQL (`CustomScript`)
- Installation par utilisateur (`UserScript` table de liaison)
- Exécution isolée dans virtualenv dédié

**Workflow marketplace :**

1. **Création (superadmin uniquement) :**
   - `POST /api/scripts` avec code source complet
   - Champs : name, description, language, python_version, requirements, source_code
   - Status initial : `is_approved=False`

2. **Approbation (superadmin) :**
   - `POST /api/scripts/{id}/approve?approved=true`
   - Review manuel du code avant approbation
   - Date de publication enregistrée

3. **Marketplace (tous utilisateurs) :**
   - `GET /api/scripts/marketplace` : Liste scripts approuvés uniquement
   - Retourne résumé sans code source (sécurité)

4. **Installation (tous utilisateurs) :**
   - `POST /api/scripts/{id}/install` : Ajoute script aux "mes scripts"
   - Créé entrée dans `UserScript` avec timestamp

5. **Exécution (admin/analyst owner) :**
   - `POST /api/scripts/{id}/run` avec `evidence_uid`
   - Tâche Celery `run_custom_script` :
     - Crée répertoire isolé
     - Écrit code dans `script.py`
     - Créé virtualenv : `python -m venv venv/`
     - Installe dépendances : `pip install -r requirements.txt`
     - Injecte variables d'environnement : CASE_ID, EVIDENCE_UID, EVIDENCE_PATH, OUTPUT_DIR
     - Exécute : `venv/bin/python script.py`
     - Capture stdout/stderr

6. **Import GitHub (superadmin) :**
   - `POST /api/scripts/import-github` avec repo_url, branch, scripts_path
   - Parse tous les `.py` dans le répertoire
   - Créé scripts non-approuvés (review manuelle ensuite)
   - Retourne statistiques : imported, skipped, errors

**Sécurité scripts :**
- Isolation : virtualenv dédié par exécution
- Sandboxing : limité à `/lake` (TODO : conteneur dédié)
- Approval workflow : superadmin valide avant publication
- Audit trail : TaskRun enregistre toutes les exécutions
- Variables d'environnement contrôlées

### 11. **HedgeDoc Integration**

**Rôle :** Prise de notes collaboratives par case

**Workflow :**
- Création automatique d'un pad HedgeDoc à la création du case
- Slug aléatoire (32 chars) stocké dans `Case.hedgedoc_slug`
- URL publique : `{DM_HEDGEDOC_PUBLIC_URL}/{slug}`
- Édition collaborative en temps réel (Markdown)
- Bouton "Ouvrir dans HedgeDoc" dans l'UI

**Configuration :**
- DM_HEDGEDOC_ENABLED=true
- DM_HEDGEDOC_BASE_URL=http://hedgedoc:3000 (interne)
- DM_HEDGEDOC_PUBLIC_URL=http://localhost:3000 (user)
- Service HedgeDoc + PostgreSQL dédié (port 5433)

### 12. **Infrastructure & Load Balancing**

**Docker Compose Stack :**
- **Traefik** (port 8080) : Load balancer avec routing automatique
- **PostgreSQL** (port 5432) : Métadonnées
- **Redis** (port 6379) : Celery broker
- **OpenSearch** (port 9200) : Index
- **OpenSearch Dashboards** (port 5601) : Visualisation
- **API FastAPI** (port interne 8000, exposé via Traefik)
- **Celery Worker** : Scaling horizontal prêt
- **Frontend React** (port 5174)
- **HedgeDoc** (port 3000) + HedgeDoc DB (port 5433)

**Scaling :**
```bash
docker-compose up -d --scale api=3      # 3 réplicas API
docker-compose up -d --scale worker=5   # 5 workers Celery
```
Traefik distribue automatiquement les requêtes.

**Volumes persistants :**
- postgres-data, redis-data, opensearch-data
- lake-data (artefacts forensiques)
- hedgedoc-db-data, hedgedoc-uploads

**Commandes Makefile :**
- `make demo` : Clean + start + ingestion données test
- `make up/down` : Démarrer/arrêter stack
- `make logs SERVICE=api` : Voir logs
- `make clean` : Nettoyer volumes (DANGER : supprime données)
- `make shell-api` : Shell dans container API
- `make check-opensearch` : Vérifier santé OpenSearch

---

## 🔄 Workflow Type

### Scénario : Analyse d'un disque Windows

1. **Analyste crée un case** via UI
   - Frontend → API → PostgreSQL
   - Case ID généré : `case_123`

2. **Upload de l'image/artefacts**
   - Storage : `/storage/case_123/host_01/raw/`

3. **Sélection des parsers** (ex: Prefetch, EVTx, Registry, MFT)
   - UI affiche parsers disponibles depuis registry
   - Analyste sélectionne + configure

4. **Lancement orchestré**
   - API → Celery tasks créées pour chaque parser
   - Redis queue : `[prefetch_task, evtx_task, registry_task, mft_task]`

5. **Workers exécutent**
   - Worker 1 : Build Go parser → Execute → Output Parquet
   - Worker 2 : Python parser → Execute → Output Parquet
   - Parallélisation automatique

6. **Ingestion OpenSearch**
   - Tâche Celery : `index_results`
   - Lecture Parquet → Conversion JSON → Bulk API OpenSearch
   - Mapping hybride appliqué

7. **Exploration & Timeline**
   - Analyste recherche dans OpenSearch via UI
   - Application de règles de détection
   - Annotation d'événements suspects
   - Export de timeline

---

## 🎨 Design Patterns

### Pattern 1 : **Registry de Parsers**

Les parsers sont déclarés dans PostgreSQL avec :
- Métadata (nom, langage, version)
- Configuration schema (JSON Schema)
- Build instructions (pour Go/Rust)
- Output schema (champs spécifiques)

Avantages :
- Ajout de parsers sans redéploiement
- Versionning
- UI dynamique

### Pattern 2 : **Pipeline d'Ingestion**

```
Parquet (storage) → Celery Task → Stream Processing → Batch Bulk → OpenSearch
```

- Traitement par chunks (évite OOM)
- Transformation : ajout des champs communs
- Validation du schema
- Bulk indexing pour performance

### Pattern 3 : **Task Chaining**

```python
# Exemple de chaîne de tâches
chain(
    build_parser.si(parser_id="prefetch", lang="go"),
    parse_artifact.si(artifact_path="/storage/case_123/..."),
    index_results.si()
).apply_async()
```

Permet des workflows complexes (parser A → parser B basé sur résultats A)

---

## 📊 Évolutivité

### Phase 1 : Local/Dev (actuel)
- Tout sur une machine
- Docker Compose
- Volumes locaux

### Phase 2 : Small Team
- Workers sur plusieurs machines
- MinIO pour storage distribué
- OpenSearch 3 nodes

### Phase 3 : Enterprise
- Kubernetes
- S3 / Object Storage
- OpenSearch cluster dédié
- Multi-tenancy (isolation par case)

---

## 🔐 Considérations Sécurité

- **Isolation parsers** : Chaque parser dans un environnement contrôlé
- **Validation inputs** : Schema validation avant parsing
- **Audit trail** : Toutes actions loggées dans PostgreSQL
- **Access control** : Permissions par case (Django)
- **Data retention** : Politique de suppression automatique

---

## 🚀 État Actuel & Prochaines Étapes

### ✅ Fonctionnalités Implémentées (Phase 1 complète)

**Authentification & Sécurité :**
- ✅ JWT authentication avec expiration 24h
- ✅ OTP/2FA (TOTP) complet avec QR codes
- ✅ Email verification optionnelle
- ✅ RBAC 4 rôles (superadmin, admin, analyst, viewer)
- ✅ Password hashing bcrypt
- ✅ User management (CRUD, change password, profile)

**Gestion de cas :**
- ✅ CRUD cases avec ownership
- ✅ Evidences upload et stockage `/lake`
- ✅ Notes markdown + HedgeDoc integration
- ✅ Quotas analysts (1 case, 20GB)
- ✅ Cascade delete

**Pipeline d'analyse :**
- ✅ Registry parsers (AnalysisModule)
- ✅ 5+ parsers (MFT, Dissect, test events)
- ✅ Exécution Celery avec monitoring
- ✅ TaskRun historique complet

**Marketplace scripts :**
- ✅ CRUD scripts (superadmin)
- ✅ Workflow approval
- ✅ Installation utilisateurs
- ✅ Exécution isolée (Docker sandbox)
- ✅ Import GitHub
- ✅ Support multi-langages (Python, Rust, Go)
- ✅ Limitations ressources (CPU, RAM, timeout)
- ✅ Sécurité renforcée (no network, read-only fs)

**OpenSearch :**
- ✅ Indexation Parquet/CSV/JSONL
- ✅ Index par case
- ✅ Bulk indexing (500 docs/batch)
- ✅ API recherche, agrégations, timeline
- ✅ Stats par case

**Interface :**
- ✅ Login/register avec OTP
- ✅ Case management
- ✅ Evidence management
- ✅ Pipeline view
- ✅ Explorer (search)
- ✅ Timeline
- ✅ Marketplace
- ✅ Admin panel
- ✅ Security settings
- ✅ Dark mode

**Infrastructure :**
- ✅ Docker Compose stack complète
- ✅ Traefik load balancing
- ✅ Volumes persistants
- ✅ Makefile DX (+ commandes migrations)
- ✅ Scripts démo/test
- ✅ Alembic migrations configurées

### 📋 Production Readiness : ~60-65%

**Par catégorie :**
- Sécurité : 70% (+20% avec sandbox Docker)
- Auth/AuthZ : 80%
- API Protection : 60%
- Infrastructure : 50% (+20% avec Docker sandbox)
- Database Management : 80% (Alembic migrations)
- Script Execution : 85% (Sandbox multi-langages)
- Monitoring : 0%
- Testing : 10% (smoke tests sandbox)
- CI/CD : 0%

### 🎯 Prochaines Étapes Prioritaires

**Court terme (1-2 semaines) :**
1. ✅ **Migrations Alembic** : Gestion schéma DB versionnée (COMPLÉTÉ)
2. ✅ **Sandbox scripts** : Conteneur Docker dédié pour exécution scripts custom (COMPLÉTÉ)
3. **Storage S3/GCS** : Support object storage pour `/lake` (multi-nœuds)
4. **Tests unitaires** : Couverture endpoints critiques (auth, RBAC, cases)
5. **Refresh tokens** : Renouvellement sans re-login
6. **Rate limiting** : Protection endpoints publics (login, register)

**Moyen terme (1-2 mois) :**
1. **CI/CD complet** : GitHub Actions (tests, build, deploy)
2. **Monitoring** : Prometheus + Grafana (métriques API, Celery, OpenSearch)
3. **Alertes** : Erreurs critiques, quotas dépassés, health checks
4. **Postgres/Redis/OpenSearch managés** : Cloud SQL, Memorystore, Elastic Cloud
5. **Password reset** : Workflow via email
6. **Tests d'intégration** : Workflows end-to-end
7. **Parsers additionnels** : EVTx, Registry, Prefetch, PE modules

**Long terme (3-6 mois) :**
1. **Kubernetes deployment** : GKE/EKS avec Helm charts
2. **OAuth2/SSO** : Google, GitHub, SAML enterprise
3. **Recovery codes MFA** : Backup si perte device OTP
4. **API keys** : Authentification pour CI/CD et intégrations
5. **Multi-tenancy** : Isolation complète entre organisations
6. **Audit logs** : Traçabilité complète actions utilisateurs
7. **Terraform IaC** : Infrastructure as Code pour déploiement cloud
8. **Advanced analytics** : ML pour détection anomalies, clustering événements

---

## 📝 Notes Techniques

### Pourquoi Parquet ?
- Compression excellente (ratio 10:1 typique)
- Schema evolution
- Columnar = queries analytiques rapides
- Standard dans l'écosystème data

### Pourquoi OpenSearch ?
- Full-text search puissant
- Aggregations pour analytics
- OpenSource vs Elasticsearch
- Dashboards inclus (alternative Kibana)

### Pourquoi Celery ?
- Mature et battle-tested
- Support multi-langages via subprocess
- Monitoring (Flower)
- Scaling horizontal facile

---

## 📚 Documentation Complémentaire

- **AUTHENTICATION.md** : Guide complet authentification (JWT, OTP, email verification, RBAC)
- **MIGRATIONS.md** : Guide des migrations Alembic (création, application, rollback)
- **SANDBOX.md** : Guide du sandbox multi-langages (Python, Rust, Go, sécurité, exemples)
- **SANDBOX_SETUP.md** : Résumé implémentation sandbox (fichiers créés, tests, roadmap)
- **QUICK_START.md** : Démarrage rapide en 3 commandes
- **STACK_SETUP.md** : Configuration détaillée de la stack
- **STATUS.md** : État actuel du projet et changements récents
- **PHASE1_COMPLETE.md** : Détails implémentation Phase 1 (Auth & Sécurité)
- **MAKEFILE.md** : Documentation des commandes Makefile
- **API Docs** : http://localhost:8080/docs (Swagger) et /redoc (ReDoc)

---

**Version:** 2.0
**Date:** 2025-11-11
**Dernière mise à jour:** Post-implémentation OTP/2FA et Marketplace
**Auteur:** Architecture Requiem
