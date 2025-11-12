#!/bin/bash

# Script de renommage du projet
# Usage: ./rename_project.sh <nouveau_nom>
# Exemple: ./rename_project.sh "forensicHub"

# Ne pas arrêter sur les erreurs sed (fichiers binaires, etc.)
set +e

# Détection automatique de l'ancien nom
# Vérifier d'abord si "Requiem" ou "Requiem" est présent
if grep -rq "Requiem\|Requiem" docker-compose.yml 2>/dev/null || grep -rq "Requiem\|Requiem" frontend/src/components/BrandMark.tsx 2>/dev/null; then
    OLD_NAME="requiem"
    OLD_NAME_CAMEL="Requiem"
    OLD_NAME_UPPER="REQUIEM"
    OLD_NAME_TITLE="Requiem"
    echo "ℹ️  Détection: Ancien nom détecté = 'Requiem' (correction nécessaire)"
elif grep -rq "requiem" docker-compose.yml 2>/dev/null; then
    OLD_NAME="requiem"
    OLD_NAME_CAMEL="Requiem"
    OLD_NAME_UPPER="REQUIEM"
    OLD_NAME_TITLE="Requiem"
    echo "ℹ️  Détection: Ancien nom détecté = 'requiem'"
elif grep -rq "requiem" docker-compose.yml 2>/dev/null; then
    OLD_NAME="requiem"
    OLD_NAME_CAMEL="Requiem"
    OLD_NAME_UPPER="REQUIEM"
    OLD_NAME_TITLE="Requiem"
    echo "ℹ️  Détection: Ancien nom détecté = 'requiem'"
else
    # Par défaut, utiliser requiem
    OLD_NAME="requiem"
    OLD_NAME_CAMEL="Requiem"
    OLD_NAME_UPPER="REQUIEM"
    OLD_NAME_TITLE="Requiem"
    echo "ℹ️  Utilisation du nom par défaut: 'requiem'"
fi

if [ -z "$1" ]; then
    echo "❌ Erreur: Vous devez fournir un nouveau nom pour le projet"
    echo "Usage: ./rename_project.sh <nouveau_nom> [ancien_nom]"
    echo "Exemple: ./rename_project.sh forensicHub"
    echo "Exemple: ./rename_project.sh forensicHub requiem"
    exit 1
fi

# Permettre de forcer l'ancien nom en paramètre optionnel
if [ -n "$2" ]; then
    OLD_NAME="$2"
    OLD_NAME_CAMEL=$(echo "$OLD_NAME" | sed 's/^./\U&/')
    OLD_NAME_UPPER=$(echo "$OLD_NAME" | tr '[:lower:]' '[:upper:]')
    OLD_NAME_TITLE=$(echo "$OLD_NAME" | sed 's/^./\U&/')
    echo "ℹ️  Ancien nom forcé: $OLD_NAME"
fi

NEW_NAME="$1"
NEW_NAME_LOWER=$(echo "$NEW_NAME" | tr '[:upper:]' '[:lower:]')
NEW_NAME_UPPER=$(echo "$NEW_NAME" | tr '[:lower:]' '[:upper:]')
NEW_NAME_TITLE=$(echo "$NEW_NAME" | sed 's/^./\U&/')

echo "🔄 Renommage du projet..."
echo "   Ancien nom: $OLD_NAME / $OLD_NAME_CAMEL"
echo "   Nouveau nom: $NEW_NAME_LOWER / $NEW_NAME"
echo ""

# Fonction pour vérifier si un fichier est texte
is_text_file() {
    local file="$1"
    if file "$file" 2>/dev/null | grep -q "text"; then
        return 0
    fi
    # Fallback: vérifier les caractères non-printables
    if grep -Iq . "$file" 2>/dev/null; then
        return 0
    fi
    return 1
}

# Fonction pour remplacer dans un fichier
replace_in_file() {
    local file="$1"
    if [ ! -f "$file" ]; then
        return 1
    fi
    
    # Vérifier que c'est un fichier texte
    if ! is_text_file "$file"; then
        return 0  # Ignorer silencieusement les fichiers binaires
    fi
    
    # Utiliser LC_ALL=C pour éviter les problèmes d'encodage
    export LC_ALL=C
    
    # Liste de tous les anciens noms possibles à remplacer
    # (pour gérer les cas de renommage partiel et les erreurs)
    OLD_NAMES=("$OLD_NAME" "requiem" "requiem")
    OLD_NAMES_CAMEL=("$OLD_NAME_CAMEL" "Requiem" "Requiem" "Requiem" "Requiem")
    OLD_NAMES_UPPER=("$OLD_NAME_UPPER" "REQUIEM" "REQUIEM")
    OLD_NAMES_TITLE=("$OLD_NAME_TITLE" "Requiem" "Requiem" "Requiem" "Requiem")
    
    # macOS nécessite une extension pour sed -i
    if [[ "$OSTYPE" == "darwin"* ]]; then
        for old in "${OLD_NAMES[@]}"; do
            sed -i '' "s/$old/$NEW_NAME_LOWER/g" "$file" 2>/dev/null
        done
        for old in "${OLD_NAMES_CAMEL[@]}"; do
            sed -i '' "s/$old/$NEW_NAME/g" "$file" 2>/dev/null
        done
        for old in "${OLD_NAMES_UPPER[@]}"; do
            sed -i '' "s/$old/$NEW_NAME_UPPER/g" "$file" 2>/dev/null
        done
        for old in "${OLD_NAMES_TITLE[@]}"; do
            sed -i '' "s/$old/$NEW_NAME_TITLE/g" "$file" 2>/dev/null
        done
    else
        for old in "${OLD_NAMES[@]}"; do
            sed -i "s/$old/$NEW_NAME_LOWER/g" "$file" 2>/dev/null
        done
        for old in "${OLD_NAMES_CAMEL[@]}"; do
            sed -i "s/$old/$NEW_NAME/g" "$file" 2>/dev/null
        done
        for old in "${OLD_NAMES_UPPER[@]}"; do
            sed -i "s/$old/$NEW_NAME_UPPER/g" "$file" 2>/dev/null
        done
        for old in "${OLD_NAMES_TITLE[@]}"; do
            sed -i "s/$old/$NEW_NAME_TITLE/g" "$file" 2>/dev/null
        done
    fi
    
    if [ $? -eq 0 ]; then
        echo "   ✓ $file"
    fi
    return 0
}

# 1. Fichiers de configuration Docker
echo "📦 Mise à jour des fichiers Docker..."
replace_in_file "docker-compose.yml"
replace_in_file "docker-compose.prod.yml"
replace_in_file "docker-compose.opensearch.yml"

# 2. Fichiers de configuration du projet
echo "⚙️  Mise à jour des fichiers de configuration..."
replace_in_file "frontend/package.json"
replace_in_file "services/api/pyproject.toml"
replace_in_file "Makefile"

# 3. Fichiers de code source (Python)
echo "🐍 Mise à jour des fichiers Python..."
find services/api -type f \( -name "*.py" -o -name "*.pyi" \) \
    -not -path "*/__pycache__/*" \
    -not -path "*/.venv/*" \
    -not -path "*/venv/*" \
    -not -path "*/alembic/versions/*" \
    -not -path "*/site-packages/*" \
    -not -path "*/.pytest_cache/*" | while read file; do
    replace_in_file "$file"
done

# 4. Fichiers de code source (TypeScript/React)
echo "⚛️  Mise à jour des fichiers TypeScript/React..."
find frontend/src -type f \( -name "*.ts" -o -name "*.tsx" \) | while read file; do
    replace_in_file "$file"
done

# 5. Fichiers de documentation
echo "📚 Mise à jour de la documentation..."
find . -type f -name "*.md" \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -not -path "*/.venv/*" \
    -not -path "*/venv/*" \
    -not -path "*/site-packages/*" | while read file; do
    replace_in_file "$file"
done

# 6. Fichiers de configuration shell
echo "🔧 Mise à jour des scripts shell..."
find . -type f -name "*.sh" \
    -not -path "*/node_modules/*" \
    -not -path "*/.git/*" \
    -not -path "*/.venv/*" \
    -not -path "*/venv/*" \
    -not -path "*/site-packages/*" | while read file; do
    replace_in_file "$file"
done

# 7. Fichiers HTML
echo "🌐 Mise à jour des fichiers HTML..."
find frontend -type f -name "*.html" \
    -not -path "*/node_modules/*" \
    -not -path "*/.venv/*" | while read file; do
    replace_in_file "$file"
done

# 8. Fichiers de configuration spécifiques
echo "📋 Mise à jour des fichiers de configuration spécifiques..."
replace_in_file "services/api/app/config.py"
replace_in_file "services/api/app/main.py"
replace_in_file "services/api/app/routers/auth.py"
replace_in_file "services/api/app/routers/health.py"

# Note: Les migrations Alembic ne sont PAS modifiées pour préserver l'historique
echo ""
echo "⚠️  Note: Les fichiers de migration Alembic n'ont pas été modifiés"
echo "   pour préserver l'historique de la base de données."
echo ""
echo "✅ Renommage terminé !"
echo ""
echo "📝 Prochaines étapes manuelles:"
echo "   1. Renommer le dossier du projet si nécessaire"
echo "   2. Mettre à jour les variables d'environnement (.env)"
echo "   3. Reconstruire les images Docker:"
echo "      docker-compose build"
echo "   4. Recréer les conteneurs:"
echo "      docker-compose down"
echo "      docker-compose up -d"
echo "   5. Vérifier les index OpenSearch (préfixe: ${NEW_NAME_LOWER}-case-*)"
echo "   6. Mettre à jour les noms de domaines dans la configuration Traefik"
echo ""

