# Sandbox Runners - Multi-Language Script Execution

Ce répertoire contient les images Docker pour l'exécution isolée et sécurisée des scripts custom dans différents langages.

## Architecture

Chaque langage dispose de son propre Dockerfile optimisé pour :
- **Build** : Compilation si nécessaire (Rust, Go)
- **Exécution** : Runtime isolé et sécurisé
- **Dépendances** : Installation des bibliothèques tierces

## Langages supportés

- **Python** : 3.10, 3.11, 3.12
- **Rust** : Stable, nightly
- **Go** : 1.21+
- **JavaScript/Node.js** : 18+, 20+ (futur)
- **C/C++** : gcc, clang (futur)

## Sécurité

Toutes les images implémentent :
- ✅ Utilisateur non-root
- ✅ Filesystem read-only (sauf /tmp et /output)
- ✅ Network isolé (--network none)
- ✅ CPU/Memory limits
- ✅ Timeout d'exécution
- ✅ Aucun accès Docker socket
- ✅ Capabilities Linux minimales

## Usage

Les images sont automatiquement utilisées par la tâche Celery `run_custom_script` selon le langage du script.
