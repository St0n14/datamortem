#!/bin/bash

# Script d'arrêt de la stack Requiem
# Usage: ./stop-stack.sh

echo "=================================================="
echo "🛑 ARRÊT STACK Requiem"
echo "=================================================="
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Arrêter tous les services Docker
echo "Arrêt de tous les services Docker..."
echo "  - Frontend React"
echo "  - Backend API (toutes les réplicas)"
echo "  - Celery Worker (toutes les réplicas)"
echo "  - Traefik"
echo "  - OpenSearch Dashboards"
echo "  - OpenSearch"
echo "  - Redis"
echo "  - PostgreSQL"
docker-compose down
echo -e "${GREEN}✅ Services Docker arrêtés${NC}"

echo ""
echo "=================================================="
echo "✅ STACK ARRÊTÉE"
echo "=================================================="
echo ""
echo "Pour redémarrer: ./start-stack.sh"
echo ""
echo "Options supplémentaires:"
echo "  Supprimer les volumes:  docker-compose down -v"
echo "  Supprimer les images:   docker-compose down --rmi all"
echo ""
