#!/usr/bin/env bash

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Requiem - Test de la configuration DinD${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

FAILED=0

# Test 1: Service DinD running
echo -e "${YELLOW}[1/6] Test: Service docker-dind en cours d'exécution${NC}"
if docker ps --format '{{.Names}}' | grep -q "requiem-dind"; then
    echo -e "${GREEN}✓ PASS${NC}"
else
    echo -e "${RED}✗ FAIL - Service docker-dind non trouvé${NC}"
    FAILED=1
fi
echo ""

# Test 2: Celery peut se connecter au daemon DinD
echo -e "${YELLOW}[2/6] Test: Connexion Celery → DinD${NC}"
if docker exec requiem-celery docker info &>/dev/null; then
    VERSION=$(docker exec requiem-celery docker version --format '{{.Server.Version}}' 2>/dev/null)
    echo -e "${GREEN}✓ PASS - Version daemon: $VERSION${NC}"
else
    echo -e "${RED}✗ FAIL - Celery ne peut pas se connecter au daemon DinD${NC}"
    FAILED=1
fi
echo ""

# Test 3: Variables d'environnement correctes
echo -e "${YELLOW}[3/6] Test: Variables d'environnement Docker${NC}"
DOCKER_HOST=$(docker exec requiem-celery printenv DOCKER_HOST 2>/dev/null)
DOCKER_TLS=$(docker exec requiem-celery printenv DOCKER_TLS_VERIFY 2>/dev/null)
DOCKER_CERT=$(docker exec requiem-celery printenv DOCKER_CERT_PATH 2>/dev/null)

if [[ "$DOCKER_HOST" == "tcp://docker-dind:2376" ]]; then
    echo -e "${GREEN}✓ DOCKER_HOST=$DOCKER_HOST${NC}"
else
    echo -e "${RED}✗ DOCKER_HOST incorrect: $DOCKER_HOST${NC}"
    FAILED=1
fi

if [[ "$DOCKER_TLS" == "1" ]]; then
    echo -e "${GREEN}✓ DOCKER_TLS_VERIFY=$DOCKER_TLS${NC}"
else
    echo -e "${RED}✗ DOCKER_TLS_VERIFY incorrect: $DOCKER_TLS${NC}"
    FAILED=1
fi

if [[ "$DOCKER_CERT" == "/certs/client" ]]; then
    echo -e "${GREEN}✓ DOCKER_CERT_PATH=$DOCKER_CERT${NC}"
else
    echo -e "${RED}✗ DOCKER_CERT_PATH incorrect: $DOCKER_CERT${NC}"
    FAILED=1
fi
echo ""

# Test 4: Certificats TLS montés
echo -e "${YELLOW}[4/6] Test: Certificats TLS disponibles${NC}"
if docker exec requiem-celery test -f /certs/client/cert.pem 2>/dev/null; then
    echo -e "${GREEN}✓ cert.pem trouvé${NC}"
else
    echo -e "${RED}✗ cert.pem manquant${NC}"
    FAILED=1
fi

if docker exec requiem-celery test -f /certs/client/key.pem 2>/dev/null; then
    echo -e "${GREEN}✓ key.pem trouvé${NC}"
else
    echo -e "${RED}✗ key.pem manquant${NC}"
    FAILED=1
fi

if docker exec requiem-celery test -f /certs/client/ca.pem 2>/dev/null; then
    echo -e "${GREEN}✓ ca.pem trouvé${NC}"
else
    echo -e "${RED}✗ ca.pem manquant${NC}"
    FAILED=1
fi
echo ""

# Test 5: Peut lancer un container de test dans DinD
echo -e "${YELLOW}[5/6] Test: Exécution d'un container test dans DinD${NC}"
if docker exec requiem-celery docker run --rm alpine:latest echo "Hello from DinD" 2>/dev/null | grep -q "Hello from DinD"; then
    echo -e "${GREEN}✓ PASS - Container test exécuté avec succès${NC}"
else
    echo -e "${RED}✗ FAIL - Impossible d'exécuter un container test${NC}"
    FAILED=1
fi
echo ""

# Test 6: Isolation - Vérifier que le daemon DinD est différent du host
echo -e "${YELLOW}[6/6] Test: Isolation du daemon DinD${NC}"
HOST_ID=$(docker info --format '{{.ID}}' 2>/dev/null)
DIND_ID=$(docker exec requiem-celery docker info --format '{{.ID}}' 2>/dev/null)

if [[ "$HOST_ID" != "$DIND_ID" ]]; then
    echo -e "${GREEN}✓ PASS - Daemon DinD isolé (ID différent du host)${NC}"
    echo -e "  Host ID:  ${HOST_ID:0:12}..."
    echo -e "  DinD ID:  ${DIND_ID:0:12}..."
else
    echo -e "${RED}✗ FAIL - Daemon DinD n'est pas isolé!${NC}"
    FAILED=1
fi
echo ""

# Résumé
echo -e "${BLUE}================================================${NC}"
if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}  ✓ TOUS LES TESTS RÉUSSIS${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""
    echo -e "${GREEN}La configuration DinD est fonctionnelle!${NC}"
    echo ""
    echo -e "${BLUE}Infos supplémentaires:${NC}"
    docker exec requiem-celery docker info 2>/dev/null | grep -E "(Server Version|Storage Driver|Operating System|CPUs|Total Memory)" | sed 's/^/  /'
    exit 0
else
    echo -e "${RED}  ✗ CERTAINS TESTS ONT ÉCHOUÉ${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo ""
    echo -e "${YELLOW}Debug:${NC}"
    echo -e "  1. Vérifiez les logs DinD: ${YELLOW}docker logs requiem-dind${NC}"
    echo -e "  2. Vérifiez les logs Celery: ${YELLOW}docker logs requiem-celery${NC}"
    echo -e "  3. Vérifiez le statut des services: ${YELLOW}docker-compose ps${NC}"
    exit 1
fi
