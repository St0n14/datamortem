# dataMortem - Production Deployment Guide

## Vue d'ensemble

Ce guide explique comment déployer dataMortem en mode **production** avec :
- ✅ Frontend React buildé et servi par Nginx
- ✅ Traefik comme reverse proxy unique (port 80)
- ✅ Toutes les routes centralisées via Traefik
- ✅ Configuration sécurisée avec variables d'environnement
- ✅ Workers API et Celery optimisés (multiple instances)
- ✅ Healthchecks et restart policies

---

## Architecture de production

```
                    Internet
                       │
                       ▼
              ┌─────────────────┐
              │   Traefik :80   │  ← Point d'entrée unique
              │  Load Balancer  │
              └────────┬─────────┘
                       │
       ┌───────────────┼───────────────┬──────────────┐
       │               │               │              │
       ▼               ▼               ▼              ▼
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ Frontend │   │   API    │   │ HedgeDoc │   │OpenSearch│
│  Nginx   │   │ FastAPI  │   │  :3000   │   │Dashboard │
│   :80    │   │  :8000   │   │          │   │  :5601   │
└──────────┘   └──────────┘   └──────────┘   └──────────┘
```

**Routing Traefik** :
- `http://localhost/` → Frontend (React + Nginx)
- `http://localhost/api` → API FastAPI
- `http://localhost/docs` → API Documentation (Swagger)
- `http://localhost/hedgedoc` → HedgeDoc notes collaboratives
- `http://localhost/dashboards` → OpenSearch Dashboards
- `http://localhost:8080` → Traefik Dashboard (admin)

---

## Configuration pré-déploiement

### 1. Créer le fichier `.env.prod`

```bash
cp .env.prod.example .env.prod
```

**Éditer `.env.prod`** et configurer :

```bash
# Générer un mot de passe PostgreSQL sécurisé
DM_POSTGRES_PASSWORD=$(openssl rand -base64 32)

# Générer un JWT secret (minimum 32 caractères)
DM_JWT_SECRET=$(openssl rand -base64 48)

# Mot de passe HedgeDoc
DM_HEDGEDOC_DB_PASSWORD=$(openssl rand -base64 32)
```

### 2. Vérifier la configuration frontend

**Fichier `frontend/.env.production`** (créé automatiquement par Vite) :

```bash
# API URL en production (via Traefik)
VITE_API_URL=http://localhost/api
```

Si ce fichier n'existe pas, créez-le.

### 3. Builder les images

```bash
# Builder l'image frontend en mode production
docker build -f frontend/Dockerfile.prod -t datamortem-frontend:prod ./frontend

# Builder l'API
docker build -t datamortem-api:prod ./services/api
```

---

## Déploiement

### Démarrage de la stack

```bash
# Démarrer avec docker-compose.prod.yml
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Vérifier que tous les services sont up
docker-compose -f docker-compose.prod.yml ps
```

### Initialisation de la base de données

```bash
# Attendre que la base soit prête (30 secondes)
sleep 30

# Appliquer les migrations Alembic
docker-compose -f docker-compose.prod.yml exec api uv run alembic upgrade head

# Créer l'utilisateur admin initial
docker-compose -f docker-compose.prod.yml exec api uv run python -m app.init_admin
```

### Vérification

```bash
# Healthcheck API
curl http://localhost/api/health
# Réponse attendue : {"status":"healthy"}

# Healthcheck Frontend
curl http://localhost/
# Réponse attendue : HTML de l'application React

# Traefik Dashboard
open http://localhost:8080
# Voir les routes configurées et le statut des services
```

---

## Configuration Nginx (Frontend)

Le frontend utilise Nginx avec :

**Optimisations** :
- ✅ Compression Gzip des assets
- ✅ Cache des fichiers statiques (1 an)
- ✅ Headers de sécurité (X-Frame-Options, CSP, etc.)
- ✅ SPA fallback (toutes les routes → index.html)
- ✅ Healthcheck endpoint `/health`

**Configuration** : `frontend/nginx.conf`

---

## Scaling

### Scaler l'API (load balancing)

```bash
# Démarrer 3 instances de l'API
docker-compose -f docker-compose.prod.yml up -d --scale api=3

# Traefik distribue automatiquement les requêtes
```

### Scaler les workers Celery

```bash
# Démarrer 5 workers Celery
docker-compose -f docker-compose.prod.yml up -d --scale celery-worker=5
```

---

## Monitoring

### Logs

```bash
# Tous les services
docker-compose -f docker-compose.prod.yml logs -f

# Service spécifique
docker-compose -f docker-compose.prod.yml logs -f api
docker-compose -f docker-compose.prod.yml logs -f frontend
docker-compose -f docker-compose.prod.yml logs -f traefik
```

### Traefik Dashboard

Accédez à `http://localhost:8080` pour voir :
- Routes configurées
- Backend services (API, Frontend, HedgeDoc)
- Statut healthcheck
- Métriques de trafic

### Healthchecks

```bash
# Vérifier l'état des healthchecks
docker-compose -f docker-compose.prod.yml ps

# Services avec healthcheck :
# - postgres : pg_isready
# - redis : redis-cli ping
# - opensearch : cluster health
# - frontend : wget /health
```

---

## Sécurité en production

### ⚠️ Checklist avant mise en production

- [ ] **JWT Secret** : Généré aléatoirement (min 32 chars)
- [ ] **Postgres Password** : Changé depuis la valeur par défaut
- [ ] **HedgeDoc Password** : Changé depuis la valeur par défaut
- [ ] **HTTPS/TLS** : Configurer certificats SSL (Let's Encrypt)
- [ ] **Firewall** : Ouvrir uniquement ports 80/443
- [ ] **Traefik Dashboard** : Désactiver ou protéger par auth (`--api.insecure=false`)
- [ ] **CORS Origins** : Restreindre `DM_ALLOWED_ORIGINS` au domaine prod
- [ ] **Rate Limiting** : Implémenter sur endpoints publics
- [ ] **Backup DB** : Configurer backups automatiques PostgreSQL
- [ ] **Monitoring** : Prometheus + Grafana (optionnel)
- [ ] **Logs centralisés** : ELK ou Loki (optionnel)

### Configurer HTTPS avec Let's Encrypt

**Mise à jour `docker-compose.prod.yml`** :

```yaml
traefik:
  command:
    - "--providers.docker=true"
    - "--entrypoints.web.address=:80"
    - "--entrypoints.websecure.address=:443"
    - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
    - "--certificatesresolvers.letsencrypt.acme.email=admin@yourdomain.com"
    - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - letsencrypt:/letsencrypt
```

Ajouter aux labels des services :
```yaml
- "traefik.http.routers.frontend.tls=true"
- "traefik.http.routers.frontend.tls.certresolver=letsencrypt"
```

### Protéger le Traefik Dashboard

```yaml
traefik:
  command:
    - "--api.dashboard=true"
    - "--api.insecure=false"  # Désactiver accès non-sécurisé
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.dashboard.rule=Host(`traefik.yourdomain.com`)"
    - "traefik.http.routers.dashboard.service=api@internal"
    - "traefik.http.routers.dashboard.middlewares=auth"
    - "traefik.http.middlewares.auth.basicauth.users=admin:$$apr1$$..."  # htpasswd
```

---

## Backup & Restore

### Backup PostgreSQL

```bash
# Backup base dataMortem
docker-compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U datamortem datamortem > backup_datamortem_$(date +%Y%m%d_%H%M%S).sql

# Backup base HedgeDoc
docker-compose -f docker-compose.prod.yml exec hedgedoc-db \
  pg_dump -U hedgedoc hedgedoc > backup_hedgedoc_$(date +%Y%m%d_%H%M%S).sql
```

### Backup volumes

```bash
# Lake data (artefacts forensiques)
docker run --rm \
  -v datamortem_lake-data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/lake_$(date +%Y%m%d).tar.gz /data

# OpenSearch data
docker run --rm \
  -v datamortem_opensearch-data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/opensearch_$(date +%Y%m%d).tar.gz /data
```

### Restore

```bash
# Restore PostgreSQL
cat backup_datamortem_20250111.sql | \
  docker-compose -f docker-compose.prod.yml exec -T postgres \
  psql -U datamortem datamortem

# Restore volume
docker run --rm \
  -v datamortem_lake-data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar xzf /backup/lake_20250111.tar.gz -C /
```

---

## Mise à jour (rolling update)

### Mise à jour de l'API

```bash
# Rebuild l'image
docker build -t datamortem-api:latest ./services/api

# Appliquer migrations DB
docker-compose -f docker-compose.prod.yml exec api uv run alembic upgrade head

# Redémarrer l'API (zero-downtime si scaled)
docker-compose -f docker-compose.prod.yml up -d --no-deps --build api
```

### Mise à jour du Frontend

```bash
# Rebuild l'image
docker build -f frontend/Dockerfile.prod -t datamortem-frontend:latest ./frontend

# Redémarrer le frontend
docker-compose -f docker-compose.prod.yml up -d --no-deps --build frontend
```

---

## Troubleshooting

### Frontend ne se charge pas

```bash
# Vérifier logs Nginx
docker-compose -f docker-compose.prod.yml logs frontend

# Vérifier que le build a réussi
docker-compose -f docker-compose.prod.yml exec frontend ls -la /usr/share/nginx/html

# Tester directement Nginx
curl -I http://localhost/
```

### API inaccessible

```bash
# Vérifier logs API
docker-compose -f docker-compose.prod.yml logs api

# Vérifier routing Traefik
curl http://localhost:8080/api/rawdata/routers

# Tester directement l'API (bypass Traefik)
docker-compose -f docker-compose.prod.yml exec api curl http://localhost:8000/health
```

### Traefik ne route pas correctement

```bash
# Vérifier labels des containers
docker inspect datamortem-frontend | grep -A 20 Labels

# Dashboard Traefik
open http://localhost:8080

# Logs Traefik
docker-compose -f docker-compose.prod.yml logs traefik
```

---

## Commandes Makefile (à ajouter)

```makefile
.PHONY: prod-up prod-down prod-logs prod-backup prod-restore

prod-up: ## Démarrer la stack en production
	docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d
	@echo "Waiting for services..."
	@sleep 30
	docker-compose -f docker-compose.prod.yml exec api uv run alembic upgrade head
	@echo "Production stack ready at http://localhost"

prod-down: ## Arrêter la stack production
	docker-compose -f docker-compose.prod.yml down

prod-logs: ## Voir les logs production
	docker-compose -f docker-compose.prod.yml logs -f

prod-backup: ## Backup bases de données
	@mkdir -p backups
	docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U datamortem datamortem > backups/datamortem_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "Backup saved in backups/"

prod-restart: ## Redémarrer un service (usage: make prod-restart SERVICE=api)
	docker-compose -f docker-compose.prod.yml restart $(SERVICE)

prod-scale: ## Scaler un service (usage: make prod-scale SERVICE=api N=3)
	docker-compose -f docker-compose.prod.yml up -d --scale $(SERVICE)=$(N)
```

---

## Performances

### Optimisations appliquées

**Frontend** :
- Build optimisé Vite (minification, tree-shaking)
- Compression Gzip activée (Nginx)
- Cache navigateur 1 an pour assets statiques
- HTTP/2 ready

**API** :
- 4 workers Uvicorn par défaut
- Scalable horizontalement via Traefik
- Connection pooling PostgreSQL

**Celery** :
- 4 workers concurrents par défaut
- Scalable horizontalement

**Métriques attendues** :
- Frontend (assets) : <100ms
- API (health) : <50ms
- OpenSearch : <200ms

---

## Comparaison Dev vs Prod

| Aspect | Dev (docker-compose.yml) | Prod (docker-compose.prod.yml) |
|--------|--------------------------|--------------------------------|
| Frontend | Vite dev server :5174 | Nginx + build optimisé :80 |
| Routing | Ports exposés directement | Traefik centralisé :80 |
| API Workers | 1 (--reload) | 4 (optimisé) |
| Celery Workers | 1 | 4 (scalable) |
| Volumes | Code monté (hot-reload) | Binaires uniquement |
| Restart Policy | Non | unless-stopped |
| Healthchecks | Basiques | Complets |
| Env vars | Hardcodées | .env.prod sécurisé |

---

**Version** : 1.0
**Date** : 2025-11-11
**Auteur** : dataMortem DevOps Team
