# Guide de test OpenSearch - Requiem

Ce guide explique comment tester le module OpenSearch nouvellement intégré.

## 🚀 Démarrage rapide

### 1. Installation des dépendances

```bash
cd /home/braguette/Requiem/services/api
uv sync
```

### 2. Démarrer OpenSearch

```bash
cd /home/braguette/Requiem
docker-compose -f docker-compose.opensearch.yml up -d
```

Attendez ~30 secondes que OpenSearch démarre, puis vérifiez:

```bash
curl http://localhost:9200
```

Vous devriez voir une réponse JSON avec les infos du cluster.

### 3. Démarrer l'API FastAPI

```bash
cd /home/braguette/Requiem/services/api
uv run uvicorn app.main:app --reload --port 8000
```

L'API sera accessible sur `http://localhost:8080`

---

## 🧪 Tests disponibles

### Option A: Tests Python directs (recommandé pour débuter)

Ce script teste le module OpenSearch directement (sans passer par l'API):

```bash
cd /home/braguette/Requiem/services/api
python test_opensearch.py
```

**Ce script va:**
1. ✅ Tester la connexion OpenSearch
2. ✅ Créer un index de test (`requiem-case-test_case_001`)
3. ✅ Générer 5 événements forensiques de test (CSV)
4. ✅ Indexer les événements dans OpenSearch
5. ✅ Effectuer des recherches
6. ✅ Effectuer des agrégations
7. ✅ Nettoyer l'index de test

**Sortie attendue:**
```
🔬 ===========================================================
🔬 TESTS MODULE OPENSEARCH - Requiem
🔬 ===========================================================

============================================================
TEST 1: Connexion OpenSearch
============================================================
✅ Connexion OK
   Version: 2.17.0
   Cluster: docker-cluster

...

📊 RÉSUMÉ DES TESTS
============================================================
✅ connection
✅ create_index
✅ create_data
✅ indexing
✅ search
✅ aggregations
✅ cleanup

7/7 tests réussis

🎉 TOUS LES TESTS PASSENT!
```

### Option B: Tests API HTTP

Ce script teste les endpoints REST de l'API:

```bash
cd /home/braguette/Requiem/services/api
chmod +x test_api_search.sh
./test_api_search.sh
```

**Pré-requis:** L'API doit être lancée ET l'index doit contenir des données (exécutez d'abord `test_opensearch.py`).

**Ce script teste:**
- ✅ Health check API
- ✅ Health check OpenSearch
- ✅ Endpoint `/api/search/query` (recherche)
- ✅ Endpoint `/api/search/aggregate` (agrégations)
- ✅ Endpoint `/api/search/timeline` (timeline)
- ✅ Endpoint `/api/search/stats/{case_id}` (statistiques)

---

## 🔍 Tests manuels avec curl

### 1. Health check OpenSearch

```bash
curl http://localhost:8080/api/search/health | jq
```

Réponse attendue:
```json
{
  "status": "ok",
  "opensearch_version": "2.17.0",
  "cluster_name": "docker-cluster",
  "cluster_status": "green",
  "node_count": 1
}
```

### 2. Recherche simple

```bash
curl -X POST http://localhost:8080/api/search/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "svchost.exe",
    "case_id": "test_case_001",
    "from": 0,
    "size": 10
  }' | jq
```

### 3. Recherche avec filtres

```bash
curl -X POST http://localhost:8080/api/search/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "*",
    "case_id": "test_case_001",
    "filters": {"event.type": "process"},
    "from": 0,
    "size": 10
  }' | jq
```

### 4. Agrégation

```bash
curl -X POST http://localhost:8080/api/search/aggregate \
  -H "Content-Type: application/json" \
  -d '{
    "case_id": "test_case_001",
    "field": "event.type",
    "size": 10
  }' | jq
```

### 5. Timeline

```bash
curl -X POST http://localhost:8080/api/search/timeline \
  -H "Content-Type: application/json" \
  -d '{
    "case_id": "test_case_001",
    "interval": "1h"
  }' | jq
```

### 6. Statistiques d'index

```bash
curl http://localhost:8080/api/search/stats/test_case_001 | jq
```

---

## 🖥️ OpenSearch Dashboards

OpenSearch Dashboards (équivalent Kibana) est accessible sur:

**URL:** http://localhost:5601

Vous pouvez:
- Créer des visualisations
- Explorer les données avec Dev Tools
- Créer des dashboards

---

## 📊 Tester avec vos propres données

### Scénario: Indexer les résultats d'un parser MFT existant

Si vous avez déjà un CSV de résultats MFT:

```python
from app.opensearch.client import get_opensearch_client
from app.opensearch.indexer import index_csv_results
from app.config import settings

client = get_opensearch_client(settings)

stats = index_csv_results(
    client=client,
    case_id="case_123",
    evidence_uid="evidence_001",
    parser_name="parse_mft",
    csv_path="/lake/case_123/mft/evidence_001/mft.csv",
    case_name="Investigation Malware XYZ"
)

print(f"Indexé: {stats['indexed']}/{stats['total_rows']}")
```

### Scénario: Rechercher dans vos données

```python
from app.opensearch.client import get_opensearch_client
from app.opensearch.search import search_events
from app.opensearch.index_manager import get_index_name
from app.config import settings

client = get_opensearch_client(settings)
index_name = get_index_name("case_123")

# Recherche de fichiers .exe
response = search_events(
    client=client,
    index_name=index_name,
    query="file.extension:exe",
    size=100
)

print(f"Trouvé {response['hits']['total']['value']} fichiers .exe")

for hit in response['hits']['hits']:
    print(f"  - {hit['_source'].get('file', {}).get('path')}")
```

---

## 🐛 Troubleshooting

### OpenSearch ne démarre pas

```bash
# Vérifiez les logs
docker logs requiem-opensearch

# Vérifiez que le port 9200 n'est pas déjà utilisé
lsof -i :9200

# Redémarrez
docker-compose -f docker-compose.opensearch.yml restart
```

### Erreur "Connection refused"

OpenSearch met ~30 secondes à démarrer. Attendez et réessayez.

### Erreur lors de l'import pandas/pyarrow

```bash
cd services/api
uv sync
```

### L'API ne trouve pas le router search

Vérifiez que main.py inclut bien:
```python
from .routers import search
app.include_router(search.router, prefix="/api")
```

### Index non trouvé

Créez d'abord un index:
```bash
python test_opensearch.py
```

Ou manuellement:
```python
from app.opensearch.client import get_opensearch_client
from app.opensearch.index_manager import create_index_if_not_exists
from app.config import settings

client = get_opensearch_client(settings)
create_index_if_not_exists(client, "votre_case_id")
```

---

## 📝 Prochaines étapes

Après validation des tests:

1. **Modifier les parsers existants** pour chaîner automatiquement l'indexation
2. **Créer un endpoint** pour déclencher l'indexation manuelle via l'API
3. **Intégrer au frontend** pour afficher les résultats de recherche
4. **Implémenter les règles** de détection dans OpenSearch
5. **Créer des dashboards** pour les analystes

---

## 🔗 Ressources

- [Documentation OpenSearch](https://opensearch.org/docs/latest/)
- [OpenSearch Python Client](https://github.com/opensearch-project/opensearch-py)
- [OpenSearch Dashboards](http://localhost:5601)
- [API Documentation](http://localhost:8080/docs) (Swagger UI)
