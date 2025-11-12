#!/bin/bash

# Script de démarrage de la stack complète Requiem
# Usage: ./start-stack.sh

set -e

echo "=================================================="
echo "🚀 DÉMARRAGE STACK Requiem"
echo "=================================================="
echo ""

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 0. Vérifier le secret JWT
if [ -z "$DM_JWT_SECRET" ]; then
  echo -e "${YELLOW}⚠️  DM_JWT_SECRET non défini. Génération d'une clé temporaire (dev only).${NC}"
  export DM_JWT_SECRET=$(openssl rand -hex 32)
  echo "    -> Secret généré: $DM_JWT_SECRET"
fi

# 1. Démarrer tous les services Docker (incluant API, Celery, Frontend)
echo -e "${BLUE}[1/3]${NC} Démarrage des services Docker..."
echo "   - PostgreSQL"
echo "   - Redis"
echo "   - OpenSearch"
echo "   - OpenSearch Dashboards"
echo "   - Backend API (scalable)"
echo "   - Celery Worker (scalable)"
echo "   - Frontend React"
echo "   - Traefik (reverse proxy/load balancer)"
docker-compose up -d --build
echo -e "${GREEN}✅ Services Docker démarrés${NC}"
echo ""

# 2. Attendre que les services soient prêts
echo -e "${BLUE}[2/3]${NC} Attente des services..."
echo -n "   PostgreSQL..."
until docker exec requiem-postgres pg_isready -U requiem > /dev/null 2>&1; do
    sleep 1
done
echo -e " ${GREEN}OK${NC}"

echo -n "   Redis..."
until docker exec requiem-redis redis-cli ping > /dev/null 2>&1; do
    sleep 1
done
echo -e " ${GREEN}OK${NC}"

echo -n "   OpenSearch..."
max_wait=60
waited=0
until curl -s http://localhost:9200 > /dev/null 2>&1 || [ $waited -ge $max_wait ]; do
    sleep 2
    waited=$((waited + 2))
done
if [ $waited -ge $max_wait ]; then
    echo -e " ${YELLOW}TIMEOUT (continuer quand même)${NC}"
else
    echo -e " ${GREEN}OK${NC}"
fi

echo -n "   Backend API (via Traefik)..."
until curl -s http://localhost:8080/health > /dev/null 2>&1; do
    sleep 1
done
echo -e " ${GREEN}OK${NC}"

echo -n "   Frontend..."
until curl -s http://localhost:5174 > /dev/null 2>&1; do
    sleep 1
done
echo -e " ${GREEN}OK${NC}"
echo ""

# 3. Initialiser la base de données (run migrations and create admin)
echo -e "${BLUE}[3/3]${NC} Initialisation de la base de données..."
docker exec requiem-api sh init-db.sh
echo -e "${GREEN}✅ Base de données initialisée${NC}"
echo ""

# Résumé
echo "=================================================="
echo "✅ STACK DÉMARRÉE"
echo "=================================================="
echo ""
echo "Services disponibles:"
echo "  🌐 Frontend:            http://localhost:5174"
echo "  🔌 API (Traefik):       http://localhost:8080"
echo "  📖 API Docs:            http://localhost:8080/docs"
echo "  🔍 OpenSearch:          http://localhost:9200"
echo "  📊 OpenSearch Dashboards: http://localhost:5601"
echo "  🗄️  PostgreSQL:          localhost:5432"
echo "  📮 Redis:               localhost:6379"
echo ""
echo "Logs Docker:"
echo "  📝 API:        docker logs -f requiem-api"
echo "  📝 Celery:     docker logs -f requiem-celery"
echo "  📝 Traefik:    docker logs -f requiem-traefik"
echo "  📝 Frontend:   docker logs -f requiem-frontend"
echo "  📝 OpenSearch: docker logs -f requiem-opensearch"
echo ""
echo "Commandes utiles:"
echo "  Voir tous les logs:           docker-compose logs -f"
echo "  Arrêter la stack:             docker-compose down"
echo "  Rebuild & restart:            docker-compose up -d --build"
echo "  Ajouter des réplicas API:     docker-compose up -d --scale api=2"
echo "  Ajouter des workers Celery:   docker-compose up -d --scale celery-worker=2"
echo ""
