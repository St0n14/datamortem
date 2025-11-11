# Tests pour dataMortem API

Ce répertoire contient la suite de tests pour l'API dataMortem.

## Structure

```
tests/
├── __init__.py
├── conftest.py              # Fixtures partagées
├── test_auth_security.py    # Tests unitaires pour auth/security.py
├── test_auth_permissions.py  # Tests unitaires pour auth/permissions.py
├── test_routers_auth.py     # Tests d'intégration pour routers/auth.py
├── test_routers_case.py     # Tests d'intégration pour routers/case.py
├── test_routers_health.py   # Tests pour routers/health.py
└── test_models.py           # Tests pour les modèles SQLAlchemy
```

## Installation des dépendances de test

```bash
cd services/api
uv sync --extra test
```

## Exécution des tests

### Tous les tests
```bash
pytest
```

### Avec couverture de code
```bash
pytest --cov=app --cov-report=html
```

### Tests spécifiques
```bash
# Un fichier
pytest tests/test_auth_security.py

# Une classe de test
pytest tests/test_auth_security.py::TestPasswordHashing

# Un test spécifique
pytest tests/test_auth_security.py::TestPasswordHashing::test_get_password_hash
```

### Mode verbose
```bash
pytest -v
```

### Mode très verbose
```bash
pytest -vv
```

## Couverture de code

La couverture de code est générée automatiquement lors de l'exécution des tests avec `--cov`.

- Rapport terminal : affiché dans la console
- Rapport HTML : généré dans `htmlcov/index.html`
- Rapport XML : généré dans `coverage.xml` (pour CI/CD)

## Fixtures disponibles

Les fixtures suivantes sont disponibles dans `conftest.py` :

- `test_db` : Session de base de données SQLite en mémoire
- `test_user` : Utilisateur de test standard (analyst)
- `test_admin_user` : Utilisateur admin de test
- `test_superadmin_user` : Utilisateur superadmin de test
- `test_case` : Case de test appartenant à test_user
- `test_evidence` : Evidence de test liée à test_case
- `test_event` : Événement de test
- `client` : Client FastAPI de test avec DB de test

## Notes importantes

1. **Base de données de test** : Les tests utilisent SQLite en mémoire, donc chaque test a une base de données propre.

2. **Isolation** : Chaque test est isolé et ne dépend pas des autres.

3. **Fixtures** : Les fixtures sont automatiquement nettoyées après chaque test.

4. **Authentification** : Pour tester les endpoints protégés, utilisez `create_access_token()` pour générer des tokens JWT valides.

## Ajouter de nouveaux tests

1. Créez un nouveau fichier `test_*.py` dans le répertoire `tests/`
2. Importez les fixtures nécessaires depuis `conftest.py`
3. Utilisez les fixtures pour créer des données de test
4. Testez les fonctionnalités avec des assertions claires

Exemple :
```python
def test_my_feature(client, test_db, test_user):
    token = create_access_token({
        "sub": str(test_user.id),
        "username": test_user.username,
        "email": test_user.email,
        "role": test_user.role,
    })
    
    response = client.get(
        "/api/my-endpoint",
        headers={"Authorization": f"Bearer {token}"},
    )
    
    assert response.status_code == 200
```

