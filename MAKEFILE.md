# Makefile Guide - DataMortem

## Quick Start

### Voir toutes les commandes disponibles
```bash
make help
```

### Démarrage rapide avec tests
```bash
make all
```
Cette commande :
1. Arrête la stack si elle tourne déjà
2. Lance les tests
3. Démarre la stack
4. Affiche le statut

### Mode démo avec données de test
```bash
make demo
```
⚠️ **ATTENTION** : Cette commande supprime toutes les données existantes !

Cette commande :
1. Arrête la stack et supprime tous les volumes
2. Démarre une stack fraîche
3. Attend que les services soient prêts
4. Ingère 2000 événements de démonstration dans le case "demo_case"

Après, vous pouvez vous connecter :
- **Frontend**: http://localhost:5174
- **Login**: `admin` / `admin123`

## Commandes Principales

### Gestion de la Stack

| Commande | Description |
|----------|-------------|
| `make up` | Démarre la stack |
| `make down` | Arrête la stack |
| `make restart` | Redémarre la stack |
| `make status` | Affiche l'état des services |
| `make logs` | Affiche les logs de tous les services |
| `make logs SERVICE=api` | Affiche les logs d'un service spécifique |

### Données et Base de données

| Commande | Description |
|----------|-------------|
| `make demo-data` | Ingère des données de démo (sans clean) |
| `make clean` | ⚠️ Supprime TOUTES les données et volumes |

### Tests

| Commande | Description |
|----------|-------------|
| `make test` | Test rapide de santé de l'API |
| `make test-ingestion` | Test complet du flux d'ingestion |

### Docker

| Commande | Description |
|----------|-------------|
| `make build` | Build les images Docker |
| `make rebuild` | Rebuild sans cache |

### Outils de Développement

| Commande | Description |
|----------|-------------|
| `make shell-api` | Shell dans le container API |
| `make shell-frontend` | Shell dans le container frontend |
| `make db-shell` | Console PostgreSQL |
| `make check-opensearch` | État d'OpenSearch + liste des indices |
| `make check-postgres` | État de PostgreSQL |

### Accès Rapide

| Commande | Description |
|----------|-------------|
| `make frontend` | Ouvre le frontend dans le navigateur |
| `make api-docs` | Ouvre la documentation Swagger |
| `make dashboards` | Ouvre OpenSearch Dashboards |

## Variables d'Environnement

Vous pouvez personnaliser les commandes avec des variables :

```bash
# Changer le nombre d'événements de démo
make demo-data DEMO_EVENTS=5000

# Changer le case de démo
make demo-data DEMO_CASE=my_case DEMO_EVIDENCE=my_evidence

# Voir les logs d'un service spécifique
make logs SERVICE=frontend
```

## Workflows Courants

### Développement quotidien
```bash
# Démarrer pour travailler
make up

# Voir les logs en continu
make logs SERVICE=api

# Redémarrer après des changements
make restart
```

### Test d'une nouvelle fonctionnalité
```bash
# Clean start avec données de test
make demo

# Ouvrir l'interface
make frontend
```

### Debugging
```bash
# Vérifier l'état des services
make status

# Vérifier OpenSearch
make check-opensearch

# Shell dans l'API pour debug
make shell-api

# Voir les logs récents
make logs SERVICE=api
```

### Reset complet
```bash
# ⚠️ Supprime TOUT
make clean

# Redémarrer
make up
```

## Détails Techniques

### make all
- Vérifie si la stack tourne et la down si nécessaire
- Lance les tests de santé
- Démarre tous les services
- Affiche le statut final

### make demo
1. **Down + Clean volumes** : `docker-compose down -v`
2. **Start** : `docker-compose up -d`
3. **Wait** : Attend 30s pour que les services soient opérationnels
4. **Init admin** : Vérifie/crée l'utilisateur admin
5. **Ingest** : Ingère 2000 événements via `/api/events/ingest`
   - Case : `demo_case`
   - Evidence : `demo_evidence`
   - Distribution sur 24h
   - Types d'événements : PROCESS_CREATE, NETWORK_CONNECTION, FILE_WRITE, REGISTRY_SET
   - Tags MITRE ATT&CK : execution, initial_access, lateral_movement, etc.

### Health Check
L'endpoint `/api/health` est utilisé pour vérifier que l'API est prête avant d'ingérer des données.

## Troubleshooting

### "make: command not found"
Installez make :
- macOS : `xcode-select --install`
- Ubuntu/Debian : `sudo apt-get install make`

### Les services ne démarrent pas
```bash
# Vérifier les logs
make logs

# Vérifier Docker
docker-compose ps

# Reset complet
make clean
make up
```

### L'ingestion de démo échoue
```bash
# Vérifier que l'API est prête
curl http://localhost:8080/api/health

# Vérifier les logs API
make logs SERVICE=api

# Initialiser l'admin si nécessaire
docker-compose exec -T api uv run python -m app.init_admin

# Tester manuellement
DEMO_CASE=test DEMO_EVENTS=10 bash scripts/demo_data.sh
```

### OpenSearch n'a pas de données
```bash
# Vérifier les indices
make check-opensearch

# Vérifier qu'il y a bien des événements
curl http://localhost:9200/datamortem-case-demo_case/_count
```
