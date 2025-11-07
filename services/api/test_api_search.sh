#!/bin/bash

# Script de test des endpoints OpenSearch de l'API dataMortem
# Usage: ./test_api_search.sh

API_BASE="http://localhost:8000/api"
CASE_ID="test_case_001"

echo "=================================================="
echo "🧪 TESTS API OPENSEARCH - dataMortem"
echo "=================================================="
echo ""

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Health check
echo "Test 1: Health check OpenSearch"
echo "-------------------------------"
response=$(curl -s http://localhost:8000/health)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ API accessible${NC}"
    echo "$response" | jq '.'
else
    echo -e "${RED}❌ API non accessible${NC}"
    echo "Démarrez l'API avec: cd services/api && uv run uvicorn app.main:app --reload"
    exit 1
fi
echo ""

# Test 2: OpenSearch health
echo "Test 2: Santé OpenSearch"
echo "------------------------"
response=$(curl -s "${API_BASE}/search/health")
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ OpenSearch accessible${NC}"
    echo "$response" | jq '.'
else
    echo -e "${RED}❌ OpenSearch non accessible${NC}"
    echo "Démarrez OpenSearch avec: docker-compose -f docker-compose.opensearch.yml up -d"
    exit 1
fi
echo ""

# Test 3: Recherche simple
echo "Test 3: Recherche simple"
echo "------------------------"
echo "Query: 'svchost.exe' dans case '${CASE_ID}'"
response=$(curl -s -X POST "${API_BASE}/search/query" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"svchost.exe\",
    \"case_id\": \"${CASE_ID}\",
    \"from\": 0,
    \"size\": 5
  }")

total=$(echo "$response" | jq -r '.total // 0')
if [ "$total" -gt 0 ]; then
    echo -e "${GREEN}✅ Recherche OK - ${total} résultats trouvés${NC}"
    echo "$response" | jq '{total: .total, took: .took, hits: .hits[:2]}'
else
    echo -e "${YELLOW}⚠️  Aucun résultat (index vide?)${NC}"
    echo "Exécutez d'abord: python test_opensearch.py"
fi
echo ""

# Test 4: Recherche avec filtres
echo "Test 4: Recherche avec filtres"
echo "-------------------------------"
echo "Query: événements de type 'process'"
response=$(curl -s -X POST "${API_BASE}/search/query" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"*\",
    \"case_id\": \"${CASE_ID}\",
    \"filters\": {\"event.type\": \"process\"},
    \"from\": 0,
    \"size\": 5
  }")

total=$(echo "$response" | jq -r '.total // 0')
if [ "$total" -gt 0 ]; then
    echo -e "${GREEN}✅ Recherche filtrée OK - ${total} résultats${NC}"
    echo "$response" | jq '{total: .total, hits: .hits[:1]}'
else
    echo -e "${YELLOW}⚠️  Aucun résultat${NC}"
fi
echo ""

# Test 5: Agrégations
echo "Test 5: Agrégations sur event.type"
echo "-----------------------------------"
response=$(curl -s -X POST "${API_BASE}/search/aggregate" \
  -H "Content-Type: application/json" \
  -d "{
    \"case_id\": \"${CASE_ID}\",
    \"field\": \"event.type\",
    \"size\": 10
  }")

total=$(echo "$response" | jq -r '.total // 0')
if [ "$total" -gt 0 ]; then
    echo -e "${GREEN}✅ Agrégation OK${NC}"
    echo "$response" | jq '.'
else
    echo -e "${YELLOW}⚠️  Aucune donnée pour agrégation${NC}"
fi
echo ""

# Test 6: Timeline
echo "Test 6: Timeline (1 heure)"
echo "--------------------------"
response=$(curl -s -X POST "${API_BASE}/search/timeline" \
  -H "Content-Type: application/json" \
  -d "{
    \"case_id\": \"${CASE_ID}\",
    \"interval\": \"1h\"
  }")

total=$(echo "$response" | jq -r '.total // 0')
if [ "$total" -gt 0 ]; then
    echo -e "${GREEN}✅ Timeline OK${NC}"
    echo "$response" | jq '{interval: .interval, total: .total, bucket_count: (.buckets | length)}'
else
    echo -e "${YELLOW}⚠️  Timeline vide${NC}"
fi
echo ""

# Test 7: Stats de l'index
echo "Test 7: Statistiques de l'index"
echo "--------------------------------"
response=$(curl -s "${API_BASE}/search/stats/${CASE_ID}")

doc_count=$(echo "$response" | jq -r '.document_count // 0')
if [ "$doc_count" -ge 0 ]; then
    echo -e "${GREEN}✅ Stats OK${NC}"
    echo "$response" | jq '.'
else
    echo -e "${YELLOW}⚠️  Index non trouvé${NC}"
fi
echo ""

echo "=================================================="
echo "✅ Tests terminés"
echo "=================================================="
echo ""
echo "Pour créer des données de test:"
echo "  cd services/api && python test_opensearch.py"
echo ""
echo "Pour accéder à OpenSearch Dashboards:"
echo "  http://localhost:5601"
