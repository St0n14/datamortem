# Guide des Migrations Alembic - dataMortem

## Vue d'ensemble

dataMortem utilise **Alembic** pour gérer les migrations de la base de données PostgreSQL. Alembic permet de :

- Versionner les changements de schéma de base de données
- Appliquer des migrations de manière contrôlée
- Revenir en arrière (rollback) si nécessaire
- Générer automatiquement des migrations à partir des modèles SQLAlchemy

## Architecture

### Configuration

```
services/api/
├── alembic/
│   ├── env.py                 # Configuration Alembic
│   ├── versions/              # Fichiers de migration
│   │   ├── c6e23e92af16_*.py
│   │   ├── 8f6e0f2be8d2_*.py
│   │   ├── 7b4f50a1e0e0_*.py
│   │   ├── 2a6d94c6cc2b_*.py
│   │   ├── 7c6ac304c575_*.py  # Merge migration
│   │   └── 0d8c359bb4f1_*.py  # Sync migration
│   └── script.py.mako         # Template pour nouvelles migrations
├── alembic.ini                # Config Alembic
└── app/
    ├── models.py              # Modèles SQLAlchemy
    └── db.py                  # Engine et session DB
```

### Modèles supportés

Tous les modèles définis dans `app/models.py` sont trackés :

- **User** : Utilisateurs avec auth JWT, OTP/2FA, email verification
- **Case** : Investigations forensiques avec ownership
- **Evidence** : Artefacts forensiques liés aux cases
- **AnalysisModule** : Registry des parsers disponibles
- **TaskRun** : Historique d'exécution des parsers
- **CustomScript** : Scripts marketplace Python
- **UserScript** : Table de liaison user ↔ scripts installés
- **Event** : Événements avant indexation OpenSearch

## Commandes Makefile (recommandé)

### Afficher l'état actuel

```bash
# Version actuelle de la base
make db-current

# Historique complet des migrations
make db-history
```

### Appliquer des migrations

```bash
# Appliquer toutes les migrations en attente
make db-migrate

# Équivalent à : docker-compose exec api uv run alembic upgrade head
```

### Créer une nouvelle migration

```bash
# Autogénérer une migration depuis les changements de modèles
make db-revision MSG="Add new field to User model"

# La migration sera créée dans le container puis copiée localement
```

**Exemple complet :**

1. Modifier un modèle dans `services/api/app/models.py` :
   ```python
   class User(Base):
       # ... champs existants
       phone_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)
   ```

2. Créer la migration :
   ```bash
   make db-revision MSG="Add phone_number to users"
   ```

3. Vérifier le fichier généré dans `services/api/alembic/versions/`

4. Appliquer la migration :
   ```bash
   make db-migrate
   ```

### Rollback (annuler)

```bash
# Annuler la dernière migration
make db-rollback

# Annuler les 3 dernières migrations
make db-rollback STEPS=3
```

### Stamp (forcer la version)

Utile pour marquer la base à une version spécifique sans exécuter les migrations :

```bash
# Marquer la base comme étant à jour (head)
make db-stamp REV=head

# Marquer à une révision spécifique
make db-stamp REV=c6e23e92af16
```

## Commandes Alembic directes

Si vous devez utiliser Alembic directement dans le container :

```bash
# Entrer dans le container
docker-compose exec api bash

# Commandes Alembic disponibles :
uv run alembic current              # Version actuelle
uv run alembic history              # Historique
uv run alembic upgrade head         # Appliquer migrations
uv run alembic downgrade -1         # Rollback 1 migration
uv run alembic revision --autogenerate -m "Message"  # Créer migration
uv run alembic show <revision>      # Détails d'une révision
uv run alembic heads                # Afficher les "heads"
uv run alembic branches             # Afficher les branches
```

## Workflow typique

### 1. Développement d'une nouvelle feature

```bash
# 1. Modifier les modèles SQLAlchemy
vim services/api/app/models.py

# 2. Générer la migration
make db-revision MSG="Add user preferences table"

# 3. Vérifier le fichier généré
cat services/api/alembic/versions/<nouveau_fichier>.py

# 4. Ajuster manuellement si nécessaire
vim services/api/alembic/versions/<nouveau_fichier>.py

# 5. Copier vers le container (si modifié localement)
docker cp services/api/alembic/versions/<nouveau_fichier>.py datamortem-api:/app/alembic/versions/

# 6. Appliquer la migration
make db-migrate

# 7. Tester l'application
make test
```

### 2. Déploiement en production

```bash
# 1. Vérifier l'état actuel
make db-current

# 2. Voir les migrations à appliquer
make db-history

# 3. Backup de la base (IMPORTANT !)
docker-compose exec postgres pg_dump -U datamortem datamortem > backup_$(date +%Y%m%d_%H%M%S).sql

# 4. Appliquer les migrations
make db-migrate

# 5. Vérifier que tout fonctionne
make test
```

### 3. Rollback en cas d'erreur

```bash
# 1. Identifier la migration problématique
make db-current
make db-history

# 2. Rollback
make db-rollback

# 3. Vérifier l'état
make db-current

# 4. Corriger la migration
vim services/api/alembic/versions/<fichier>.py

# 5. Réappliquer
make db-migrate
```

## Gestion des branches (merge migrations)

Alembic supporte plusieurs "heads" (branches) qui doivent être fusionnées. C'est arrivé dans notre historique :

```
8f6e0f2be8d2 (branchpoint)
    ├─→ 7b4f50a1e0e0 (Add email verification)
    └─→ 2a6d94c6cc2b (Add HedgeDoc slug)
         ↓
    7c6ac304c575 (merge)  ← Migration de fusion
```

### Créer une merge migration

```bash
# Détecter les heads multiples
docker-compose exec api uv run alembic heads

# Si 2+ heads, créer une merge
docker-compose exec api uv run alembic merge -m "Merge feature branches" <head1> <head2>

# Copier la migration
docker cp datamortem-api:/app/alembic/versions/<merge_file>.py services/api/alembic/versions/

# Appliquer
make db-migrate
```

## Bonnes pratiques

### ✅ À faire

1. **Toujours créer une backup** avant d'appliquer des migrations en production
2. **Tester les migrations** sur un environnement de dev/staging d'abord
3. **Vérifier les migrations autogénérées** : Alembic peut manquer certains changements
4. **Nommer clairement** les migrations : `make db-revision MSG="Clear description"`
5. **Versionner** les fichiers de migration dans Git
6. **Tester le rollback** pour chaque migration importante
7. **Ajouter des checks** pour éviter les erreurs si colonnes/tables existent déjà (voir nos migrations corrigées)

### ❌ À éviter

1. **Ne jamais modifier** une migration déjà appliquée en production
2. **Ne pas supprimer** de fichiers de migration du répertoire `versions/`
3. **Ne pas éditer** `alembic_version` table manuellement (sauf cas extrême)
4. **Éviter les migrations destructives** sans confirmation (DROP TABLE, DROP COLUMN)
5. **Ne pas commiter** `.env` ou credentials dans les migrations

## Pattern : Migration idempotente

Les migrations doivent pouvoir s'exécuter plusieurs fois sans erreur. Exemple :

```python
def upgrade() -> None:
    from sqlalchemy import inspect
    conn = op.get_bind()
    inspector = inspect(conn)

    # Vérifier si la table existe
    if 'users' in inspector.get_table_names():
        columns = [c['name'] for c in inspector.get_columns('users')]

        # Vérifier si la colonne existe déjà
        if 'phone_number' not in columns:
            with op.batch_alter_table('users', schema=None) as batch_op:
                batch_op.add_column(
                    sa.Column('phone_number', sa.String(), nullable=True)
                )
```

**Pourquoi ?**
- Permet de réexécuter une migration en cas d'erreur partielle
- Évite les erreurs `DuplicateColumn` / `DuplicateTable`
- Facilite les tests et le développement

## Migrations existantes

### c6e23e92af16 - Add users table and user foreign key to cases
- Création table `users` avec colonnes de base
- Ajout `owner_id` à `cases` avec FK vers `users`

### 8f6e0f2be8d2 - Add script runtime fields
- Ajout `python_version` et `requirements` à `custom_scripts`

### 7b4f50a1e0e0 - Add user security fields
- Email verification : `email_verified`, `email_verification_token`, `email_verification_sent_at`
- OTP/2FA : `otp_enabled`, `otp_secret`

### 2a6d94c6cc2b - Add HedgeDoc slug to cases
- Ajout `hedgedoc_slug` à `cases` pour intégration collaborative

### 7c6ac304c575 - Merge multiple heads
- Fusion des branches divergentes (7b4f50a1e0e0 + 2a6d94c6cc2b)

### 0d8c359bb4f1 - Sync with current models state
- Migration vide : synchronisation confirmée entre modèles et DB

## Dépannage

### Erreur : "column already exists"

```bash
# Vérifier l'état de la base
make db-current

# Option 1 : Stamp à la version actuelle sans exécuter
make db-stamp REV=head

# Option 2 : Corriger la migration pour qu'elle soit idempotente (voir pattern ci-dessus)
```

### Erreur : "Multiple heads detected"

```bash
# Lister les heads
docker-compose exec api uv run alembic heads

# Créer une merge migration
docker-compose exec api uv run alembic merge -m "Merge heads" <head1> <head2>
```

### Base corrompue / désynchronisée

```bash
# 1. Backup d'abord !
docker-compose exec postgres pg_dump -U datamortem datamortem > backup.sql

# 2. Vérifier la table alembic_version
make db-shell
SELECT * FROM alembic_version;
\q

# 3. Si vide, stamp à la bonne version
make db-stamp REV=<current_code_version>

# 4. Si incohérente, restaurer le backup et recommencer
```

## Intégration CI/CD

Pour automatiser les migrations dans un pipeline :

```yaml
# .github/workflows/deploy.yml
- name: Run database migrations
  run: |
    docker-compose exec -T api uv run alembic upgrade head
    docker-compose exec -T api uv run alembic current
```

## Ressources

- [Documentation Alembic](https://alembic.sqlalchemy.org/)
- [SQLAlchemy 2.x Docs](https://docs.sqlalchemy.org/en/20/)
- [Architecture dataMortem](./dataMortem_architecture_overview.md)
- [Guide d'authentification](./AUTHENTICATION.md)

---

**Dernière mise à jour :** 2025-11-11
**Version Alembic :** 1.13.2
**État de la base :** 0d8c359bb4f1 (head)
