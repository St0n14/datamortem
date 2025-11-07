# ✅ Interface Pipeline Opérationnelle

**Date:** 2025-11-06
**Status:** Votre interface Pipeline affiche maintenant les modules!

---

## 🎯 Accéder à l'interface

Ouvrez votre navigateur:
```
http://localhost:5174
```

---

## ✅ Ce qui a été corrigé

**Problème:** L'interface Pipeline était vide.

**Cause:** Aucun module d'analyse (AnalysisModule) n'était présent dans la base de données PostgreSQL.

**Solution:**
- ✅ Exécuté le script `seed_modules.py`
- ✅ Créé 2 modules: `parse_mft` et `sample_long_task`
- ✅ Créé un case et une evidence de test

---

## 📊 Données de test disponibles

### Case
- **ID:** `test_workflow_001`
- **Note:** Case de test pour workflow complet
- **Status:** open

### Evidence
- **UID:** `evidence_test_001`
- **Case ID:** `test_workflow_001`
- **Path:** `/tmp/test_evidence.dd`

### Modules disponibles
1. **parse_mft** - Extract $MFT from evidence and export timeline CSV
2. **sample_long_task** - Demo long-running task to test status/progress

---

## 🎮 Comment utiliser l'interface

### 1. Navigation vers Pipeline

Dans votre interface, cliquez sur **Pipeline** ou naviguez vers la vue Pipeline.

### 2. Sélectionner une evidence

Dans votre interface, sélectionnez l'evidence `evidence_test_001`.

### 3. Voir les modules

Vous devriez maintenant voir **2 modules** affichés:
- 📁 parse_mft
- ⏱️ sample_long_task

### 4. Lancer un module

Cliquez sur un module pour le lancer. Le système va:
1. Créer un TaskRun en base
2. Déclencher la tâche Celery
3. Afficher le status (queued → running → success/error)

### 5. Indexer dans OpenSearch (Nouveau!)

Une fois qu'un module a terminé avec succès:
1. Cliquez sur **"Indexer dans OpenSearch"** (si le bouton est implémenté)
2. Ou utilisez l'API directement:
```bash
curl -X POST http://localhost:8000/api/indexing/task-run \
  -H "Content-Type: application/json" \
  -d '{"task_run_id": 1}'
```

---

## 🔧 Vérifications rapides

### Vérifier que les modules sont visibles via l'API

```bash
curl http://localhost:8000/api/pipeline | jq
```

Devrait retourner 2 modules.

### Vérifier le case

```bash
curl http://localhost:8000/api/cases | jq
```

### Vérifier l'evidence

```bash
curl http://localhost:8000/api/evidences | jq
```

---

## 🚀 Endpoints API disponibles

### Pipeline
```bash
# Lister les modules
GET /api/pipeline

# Lister les modules pour une evidence
GET /api/pipeline?evidence_uid=evidence_test_001

# Lancer un module
POST /api/pipeline/run
Body: {"module_id": 1, "evidence_uid": "evidence_test_001"}

# Lister les TaskRuns
GET /api/pipeline/runs?evidence_uid=evidence_test_001
```

### Indexation OpenSearch (Nouveau!)
```bash
# Indexer un TaskRun
POST /api/indexing/task-run
Body: {"task_run_id": 1}

# Indexer tout un case
POST /api/indexing/case
Body: {"case_id": "test_workflow_001"}

# Résumé d'indexation
GET /api/indexing/case/test_workflow_001/summary
```

### Recherche OpenSearch (Nouveau!)
```bash
# Recherche
POST /api/search/query
Body: {"query": "*", "case_id": "test_workflow_001", "size": 50}

# Agrégations
POST /api/search/aggregate
Body: {"case_id": "test_workflow_001", "field": "event.type"}

# Timeline
POST /api/search/timeline
Body: {"case_id": "test_workflow_001", "interval": "1h"}
```

---

## 🎨 Ajouter le bouton "Indexer" dans le frontend

Si vous voulez ajouter un bouton pour indexer directement depuis l'interface, ajoutez dans votre composant:

```typescript
const handleIndex = async (taskRunId: number) => {
  try {
    const response = await fetch('http://localhost:8000/api/indexing/task-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_run_id: taskRunId })
    });

    const result = await response.json();

    if (result.status === 'triggered') {
      alert(`✅ Indexation démarrée! Task: ${result.celery_task_id}`);
    }
  } catch (error) {
    console.error('Erreur indexation:', error);
  }
};

// Dans votre JSX
{taskRun.status === 'success' && (
  <button onClick={() => handleIndex(taskRun.id)}>
    📊 Indexer dans OpenSearch
  </button>
)}
```

---

## 📝 Créer plus de données de test

### Créer un nouveau case

```bash
curl -X POST http://localhost:8000/api/cases \
  -H "Content-Type: application/json" \
  -d '{"case_id": "mon_case_001", "note": "Mon investigation"}' | jq
```

### Créer une nouvelle evidence

```bash
curl -X POST http://localhost:8000/api/evidences \
  -H "Content-Type: application/json" \
  -d '{
    "evidence_uid": "mon_evidence_001",
    "case_id": "mon_case_001",
    "local_path": "/path/to/disk.dd"
  }' | jq
```

### Ajouter plus de modules

Éditez `services/api/app/seed_modules.py` et ajoutez vos modules, puis:

```bash
cd services/api
uv run python -m app.seed_modules
```

---

## 🐛 Dépannage

### L'interface Pipeline est toujours vide

```bash
# 1. Vérifier que les modules existent via l'API
curl http://localhost:8000/api/pipeline | jq

# 2. Si vide, réexécuter le seed
cd services/api
uv run python -m app.seed_modules

# 3. Rafraîchir le navigateur (CTRL+F5)
```

### L'API ne répond pas

```bash
# Vérifier que l'API est démarrée
curl http://localhost:8000/health

# Si erreur, voir les logs
tail -f logs/api.log
```

### Le frontend ne se connecte pas à l'API

Vérifiez que l'URL de l'API est correcte dans votre code frontend.
L'API devrait être sur `http://localhost:8000`.

---

## 📚 Documentation complète

- **Guide rapide:** `QUICK_START.md`
- **Guide complet:** `STACK_SETUP.md`
- **Status actuel:** `STATUS.md`
- **API Swagger:** http://localhost:8000/docs

---

## ✅ Résumé

Votre interface Pipeline affiche maintenant:
- ✅ 2 modules d'analyse (parse_mft, sample_long_task)
- ✅ 1 case de test (test_workflow_001)
- ✅ 1 evidence de test (evidence_test_001)

**Prochaines étapes:**
1. Ouvrir http://localhost:5174
2. Naviguer vers Pipeline
3. Sélectionner l'evidence
4. Lancer un module
5. Indexer les résultats dans OpenSearch
6. Rechercher dans les événements!

🎉 Votre stack est complète et fonctionnelle!
