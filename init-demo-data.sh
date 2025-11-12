#!/bin/bash

# Script pour initialiser les données de démonstration
# Usage: ./init-demo-data.sh

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=================================================="
echo "🎬 INITIALISATION DES DONNÉES DE DÉMO"
echo "=================================================="
echo ""

# 1. Seed les modules d'analyse
echo -e "${BLUE}[1/3]${NC} Initialisation des modules d'analyse..."
cd services/api
uv run python -m app.seed_modules
cd ../..
echo -e "${GREEN}✅ Modules créés${NC}"
echo ""

# 2. Créer un case de démo
echo -e "${BLUE}[2/3]${NC} Création d'un case de démonstration..."
CASE_RESPONSE=$(curl -s -X POST http://localhost:8080/api/cases \
  -H "Content-Type: application/json" \
  -d '{"case_id": "demo_case_001", "note": "Case de démonstration Requiem"}')

if echo "$CASE_RESPONSE" | jq -e '.case_id' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Case créé:${NC} $(echo $CASE_RESPONSE | jq -r '.case_id')"
else
    echo "⚠️  Case déjà existant ou erreur"
fi
echo ""

# 3. Créer une evidence
echo -e "${BLUE}[3/3]${NC} Création d'une evidence de test..."
EVIDENCE_RESPONSE=$(curl -s -X POST http://localhost:8080/api/evidences \
  -H "Content-Type: application/json" \
  -d '{"evidence_uid": "demo_evidence_001", "case_id": "demo_case_001", "local_path": "/tmp/demo_disk.dd"}')

if echo "$EVIDENCE_RESPONSE" | jq -e '.evidence_uid' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Evidence créée:${NC} $(echo $EVIDENCE_RESPONSE | jq -r '.evidence_uid')"
else
    echo "⚠️  Evidence déjà existante ou erreur"
fi
echo ""

echo "=================================================="
echo "✅ DONNÉES DE DÉMO INITIALISÉES"
echo "=================================================="
echo ""
echo "📊 Données disponibles:"
echo "   • Modules: parse_mft, sample_long_task"
echo "   • Case: demo_case_001"
echo "   • Evidence: demo_evidence_001"
echo ""
echo "🌐 Accès interface:"
echo "   http://localhost:5174"
echo ""
echo "📖 Documentation:"
echo "   cat INTERFACE_READY.md"
echo ""
