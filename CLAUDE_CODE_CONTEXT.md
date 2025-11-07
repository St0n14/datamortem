# dataMortem - Architecture Overview

## 🎯 Vision du Projet

dataMortem est une plateforme d'analyse forensique d'hôte combinant :
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

### 2. **API Layer (Django + FastAPI)**

**Rôle :** Orchestration et exposition des services

**Responsabilités :**
- Gestion des cases (investigations)
- Registry des parsers disponibles
- Déclenchement des tâches Celery
- Proxy vers OpenSearch
- Moteur de règles et annotations

**Choix Django + FastAPI :**
- Django : Admin, ORM, gestion utilisateurs, cases
- FastAPI : Endpoints performance-critical (search, streaming results)

### 3. **Message Broker (Redis)**

**Rôle :** Queue de tâches pour Celery

**Usage :**
- Distribution des jobs de parsing
- Gestion de la priorité des tâches
- Cache pour les résultats intermédiaires

### 4. **Metadata Store (PostgreSQL)**

**Rôle :** Stockage des métadonnées

**Contenu :**
- Cases et investigations
- Registry des parsers (nom, langage, version, config)
- Tâches (status, timestamps, outputs paths)
- Règles et annotations timeline
- Utilisateurs et permissions

### 5. **Worker Layer (Celery)**

**Rôle :** Exécution distribuée des parsers

**Fonctionnalités :**
- **Build dynamique** : Compilation Go/Rust à la demande
- **Isolation** : Chaque parser dans son contexte
- **Monitoring** : Progression, logs, erreurs
- **Resilience** : Retry automatique, timeout

**Types de tâches :**
- `parse_artifact` : Lancer un parser
- `build_parser` : Compiler Go/Rust
- `index_results` : Envoyer vers OpenSearch

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

**Rôle :** Persistance des résultats bruts

**Options :**
- Local filesystem (dev/small cases)
- S3-compatible (MinIO, AWS S3) pour prod

**Organisation :**
```
/storage
  /case_123
    /host_01
      /prefetch_parser
        - results.parquet
        - metadata.json
      /evtx_parser
        - results.parquet
```

### 8. **OpenSearch Cluster**

**Rôle :** Indexation et recherche des événements forensiques

**Configuration :**
- **Index pattern** : `datamortem-case-{case_id}-{date}`
- **Mapping hybride** : Champs communs stricts + dynamic templates
- **Retention** : Par case (suppression quand case clôturé)

**Champs communs (ECS-inspired) :**
```json
{
  "@timestamp": "date",
  "source.parser": "keyword",
  "event.type": "keyword",
  "event.category": "keyword",
  "host.id": "keyword",
  "host.name": "keyword",
  "case.id": "keyword",
  "case.name": "keyword"
}
```

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

## 🚀 Prochaines Étapes

1. **Architecture détaillée OpenSearch** (mapping, pipeline, queries)
2. **Parser Registry implementation** (structure DB + API)
3. **Build system** pour Go/Rust dans Celery
4. **Frontend components** pour Explorer et Timeline
5. **Monitoring & Observability** (métriques, logs, alertes)

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

**Version:** 1.0  
**Date:** 2024-11-05  
**Auteur:** Architecture dataMortem
