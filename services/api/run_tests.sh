#!/bin/bash
# Script pour exécuter les tests avec couverture

set -e

echo "🧪 Exécution des tests Requiem API..."
echo ""

# Vérifier que pytest est installé
if ! command -v pytest &> /dev/null; then
    echo "❌ pytest n'est pas installé. Installez les dépendances de test :"
    echo "   uv sync --extra test"
    exit 1
fi

# Exécuter les tests avec couverture
pytest \
    --cov=app \
    --cov-report=term-missing \
    --cov-report=html \
    --cov-report=xml \
    -v \
    "$@"

echo ""
echo "✅ Tests terminés !"
echo "📊 Rapport HTML disponible dans: htmlcov/index.html"

