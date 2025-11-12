#!/usr/bin/env bash

set -e  # Exit on error

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Requiem - Migration vers Docker-in-Docker${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Step 1: Vérifier que les fichiers sont déjà modifiés
echo -e "${YELLOW}[1/8] Vérification des modifications docker-compose...${NC}"
if ! grep -q "docker-dind:" docker-compose.yml; then
    echo -e "${RED}✗ Erreur: docker-compose.yml n'a pas été modifié${NC}"
    echo -e "${YELLOW}Les modifications ont-elles été appliquées?${NC}"
    exit 1
fi
if ! grep -q "dind-certs-client:" docker-compose.yml; then
    echo -e "${RED}✗ Erreur: Les volumes DinD ne sont pas configurés${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Fichiers docker-compose modifiés${NC}"

# Step 2: Sauvegarder les changements git (si applicable)
echo ""
echo -e "${YELLOW}[2/8] Sauvegarde de run_custom_script.py...${NC}"
if git status &>/dev/null; then
    git add services/api/app/tasks/run_custom_script.py docker-compose.yml docker-compose.prod.yml 2>/dev/null || true
    echo -e "${GREEN}✓ Changements ajoutés à git${NC}"
else
    echo -e "${YELLOW}⚠ Pas de repo git détecté, skip${NC}"
fi

# Step 3: Arrêter la stack actuelle
echo ""
echo -e "${YELLOW}[3/8] Arrêt de la stack actuelle...${NC}"
docker-compose down || true
echo -e "${GREEN}✓ Stack arrêtée${NC}"

# Step 4: Supprimer les anciennes images de sandbox (optionnel)
echo ""
echo -e "${YELLOW}[4/8] Nettoyage des anciennes images sandbox...${NC}"
docker images | grep "requiem-sandbox" | awk '{print $3}' | xargs -r docker rmi -f 2>/dev/null || true
echo -e "${GREEN}✓ Images nettoyées${NC}"

# Step 5: Démarrer la nouvelle stack avec DinD
echo ""
echo -e "${YELLOW}[5/8] Démarrage de la stack avec DinD...${NC}"
docker-compose up -d
echo -e "${GREEN}✓ Stack démarrée${NC}"

# Step 6: Attendre que les services soient prêts
echo ""
echo -e "${YELLOW}[6/8] Attente que les services démarrent (30s)...${NC}"
sleep 30

# Step 7: Vérifier la connexion DinD
echo ""
echo -e "${YELLOW}[7/8] Vérification de la connexion DinD...${NC}"
echo ""

# Vérifier que le service DinD tourne
if ! docker ps | grep -q "requiem-dind"; then
    echo -e "${RED}✗ Le service docker-dind ne tourne pas!${NC}"
    echo -e "${YELLOW}Logs du service DinD:${NC}"
    docker logs requiem-dind --tail 50
    exit 1
fi
echo -e "${GREEN}✓ Service docker-dind en cours d'exécution${NC}"

# Vérifier que celery peut se connecter
if docker exec requiem-celery docker info &>/dev/null; then
    DOCKER_VERSION=$(docker exec requiem-celery docker version --format '{{.Server.Version}}')
    echo -e "${GREEN}✓ Celery connecté au daemon DinD (version $DOCKER_VERSION)${NC}"
else
    echo -e "${RED}✗ Celery ne peut pas se connecter au daemon DinD${NC}"
    echo -e "${YELLOW}Logs de celery:${NC}"
    docker logs requiem-celery --tail 50
    exit 1
fi

# Vérifier les variables d'environnement
echo ""
echo -e "${BLUE}Variables d'environnement Docker dans celery:${NC}"
docker exec requiem-celery env | grep DOCKER || echo -e "${YELLOW}Aucune variable DOCKER trouvée${NC}"

# Step 8: Afficher le statut
echo ""
echo -e "${YELLOW}[8/8] Affichage du statut final...${NC}"
echo ""
docker-compose ps

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Migration vers DinD terminée avec succès! ${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "${BLUE}📊 Statistiques:${NC}"
echo -e "  Service DinD:     ${GREEN}✓ Running${NC}"
echo -e "  Connexion Celery: ${GREEN}✓ Connected${NC}"
echo -e "  Daemon version:   ${GREEN}$DOCKER_VERSION${NC}"
echo ""
echo -e "${BLUE}🔍 Commandes utiles:${NC}"
echo -e "  Voir les logs DinD:          ${YELLOW}docker logs requiem-dind${NC}"
echo -e "  Voir les logs Celery:        ${YELLOW}docker logs requiem-celery -f${NC}"
echo -e "  Tester depuis Celery:        ${YELLOW}docker exec requiem-celery docker ps${NC}"
echo -e "  Lister les images dans DinD: ${YELLOW}docker exec requiem-celery docker images${NC}"
echo ""
echo -e "${BLUE}🧪 Prochaine étape:${NC}"
echo -e "  Teste l'exécution d'un script custom pour vérifier que tout fonctionne!"
echo ""
