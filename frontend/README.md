# dataMortem Frontend

Interface web pour la plateforme d'analyse forensique dataMortem.

## Fonctionnalités

### 1. Cases View (/)
- Vue d'ensemble de tous les cases forensiques
- Liste des evidences par case
- Création de nouveaux cases et evidences

### 2. Pipeline View (/pipeline)
- Sélection d'une evidence à analyser
- Affichage des modules d'analyse disponibles (parse_mft, sample_long_task, etc.)
- **Lancement des modules d'analyse** avec bouton "Run"
- **Visualisation du statut** en temps réel (queued → running → success/error)
- **Bouton "Index"** qui apparaît automatiquement quand un module termine avec succès
- **Badge "Indexed"** qui indique si les résultats sont déjà indexés dans OpenSearch
- Tableau des TaskRuns avec historique et actions
- Rafraîchissement automatique toutes les 3 secondes pour les tâches en cours

#### Workflow Pipeline
1. Sélectionner une evidence dans le dropdown
2. Cliquer sur "Run" pour lancer un module
3. Attendre que le statut passe à "success"
4. Cliquer sur "Index" pour indexer les résultats dans OpenSearch
5. Le badge "Indexed" apparaît une fois l'indexation terminée

### 3. Explorer View (/explorer)
- **Recherche full-text** dans OpenSearch
- **Statistiques du case** : nombre de documents, taille de l'index, santé
- **Filtres et tri** : par timestamp, event type, file path, process name
- **Pagination** des résultats (50 par page)
- **Détails d'événement** : modal avec le document JSON complet
- Support des requêtes OpenSearch :
  - Wildcard: `*`
  - Terme: `svchost.exe`
  - Champ: `event.type:file`
  - Range: `@timestamp:[2024-01-01 TO *]`

## Installation

```bash
# Installer les dépendances
npm install

# Lancer le serveur de développement
npm run dev

# Build pour production
npm run build
```

## Configuration

Le frontend se connecte au backend via le proxy Vite configuré dans `vite.config.ts` :
- Backend API : `http://localhost:8000/api`
- Frontend : `http://localhost:5174`

## Architecture

```
src/
├── App.tsx              # Composant principal avec routing
├── App.css              # Styles globaux
├── main.tsx             # Point d'entrée React
├── types/
│   └── index.ts         # Types TypeScript pour l'API
├── services/
│   └── api.ts           # Couche service pour appels API
└── views/
    ├── CasesView.tsx    # Vue des cases et evidences
    ├── PipelineView.tsx # Vue pipeline avec indexation
    └── ExplorerView.tsx # Vue recherche OpenSearch
```

## API Backend

Le frontend communique avec ces endpoints :

### Cases
- `GET /api/cases` - Liste des cases
- `POST /api/cases` - Créer un case

### Evidence
- `GET /api/evidences` - Liste des evidences
- `POST /api/evidences` - Créer une evidence

### Pipeline
- `GET /api/pipeline` - Liste des modules
- `POST /api/pipeline/run` - Lancer un module
- `GET /api/pipeline/runs` - Liste des TaskRuns

### Indexation
- `POST /api/indexing/task-run` - Indexer un TaskRun
- `POST /api/indexing/case` - Indexer tout un case
- `GET /api/indexing/case/{case_id}/summary` - Résumé d'indexation

### Recherche
- `POST /api/search/query` - Recherche OpenSearch
- `POST /api/search/aggregate` - Agrégations
- `POST /api/search/timeline` - Timeline
- `GET /api/search/stats/{case_id}` - Statistiques d'index

## Utilisation

### Workflow complet

1. **Créer des données de test** (si pas déjà fait)
   ```bash
   cd /home/braguette/dataMortem
   ./init-demo-data.sh
   ```

2. **Accéder à l'interface**
   ```
   http://localhost:5174
   ```

3. **Lancer un module d'analyse**
   - Aller dans Pipeline
   - Sélectionner `evidence_test_001`
   - Cliquer sur "Run" pour `parse_mft`
   - Attendre que le status devienne "success"

4. **Indexer les résultats**
   - Cliquer sur "Index" qui apparaît sur le module
   - Attendre le message de confirmation
   - Le badge "Indexed" apparaît

5. **Explorer les données**
   - Aller dans Explorer
   - Sélectionner le case `test_workflow_001`
   - Rechercher avec `*` pour voir tous les événements
   - Cliquer sur "View Details" pour voir le JSON complet

## Dépendances principales

- **React 18** - Framework UI
- **TypeScript** - Typage statique
- **Vite 5** - Build tool et dev server
- **react-router-dom** - Routing
- **lucide-react** - Icônes

## Développement

### Ajouter une nouvelle vue

1. Créer un fichier dans `src/views/`
2. Ajouter la route dans `src/App.tsx`
3. Ajouter le lien dans la sidebar

### Ajouter un nouveau endpoint API

1. Ajouter le type dans `src/types/index.ts`
2. Ajouter la fonction dans `src/services/api.ts`
3. Utiliser dans le composant avec `useState` et `useEffect`

## Troubleshooting

### L'API ne répond pas
```bash
# Vérifier que l'API backend est démarrée
curl http://localhost:8000/health
```

### Le frontend ne démarre pas
```bash
# Nettoyer et réinstaller
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Les modules ne s'affichent pas
```bash
# Vérifier que les modules sont seedés
curl http://localhost:8000/api/pipeline | jq

# Si vide, exécuter
cd services/api
uv run python -m app.seed_modules
```

## Production

Pour déployer en production :

```bash
# Build
npm run build

# Les fichiers sont dans dist/
# Servir avec nginx, Apache, ou un CDN
```

## Support

- Documentation backend : `/home/braguette/dataMortem/STATUS.md`
- API interactive : http://localhost:8000/docs
