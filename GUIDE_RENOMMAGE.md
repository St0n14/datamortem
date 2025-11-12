# Guide de Renommage du Projet

Ce guide vous explique comment renommer complètement votre projet `Requiem` vers un nouveau nom.

## 🎯 Vue d'ensemble

Le renommage d'un projet touche plusieurs aspects :
- **Noms de conteneurs Docker** (requiem-api, requiem-frontend, etc.)
- **Noms de réseaux Docker** (requiem)
- **Noms de bases de données** (requiem)
- **Noms d'images Docker** (requiem-sandbox-python, etc.)
- **Références dans le code** (Python, TypeScript)
- **Documentation** (README, fichiers .md)
- **Interface utilisateur** (textes affichés)
- **Préfixes d'index OpenSearch** (requiem-case-*)

## 🚀 Méthode Automatique (Recommandée)

### Étape 1 : Utiliser le script de renommage

```bash
./rename_project.sh <nouveau_nom>
```

**Exemple :**
```bash
./rename_project.sh forensicHub
```

Le script remplacera automatiquement :
- `requiem` → `forensichub` (minuscules)
- `Requiem` → `forensicHub` (camelCase)
- `Requiem` → `ForensicHub` (Title Case)
- `REQUIEM` → `FORENSICHUB` (majuscules)

### Étape 2 : Actions manuelles requises

#### 2.1. Renommer le dossier du projet (optionnel)

```bash
cd ..
mv requiem <nouveau_nom>
cd <nouveau_nom>
```

#### 2.2. Mettre à jour les variables d'environnement

Éditez vos fichiers `.env` et remplacez les références :
- `DM_DB_URL=postgresql://requiem:...` → `DM_DB_URL=postgresql://<nouveau_nom>:...`
- Vérifiez toutes les variables contenant `requiem`

#### 2.3. Reconstruire les images Docker

```bash
# Arrêter les conteneurs
docker-compose down

# Supprimer les anciennes images (optionnel)
docker images | grep requiem | awk '{print $3}' | xargs docker rmi -f

# Reconstruire
docker-compose build

# Redémarrer
docker-compose up -d
```

#### 2.4. Migrer la base de données PostgreSQL

Si vous avez déjà des données, vous devrez migrer la base :

```bash
# Option 1: Renommer la base de données
docker-compose exec postgres psql -U postgres -c "ALTER DATABASE requiem RENAME TO <nouveau_nom>;"
docker-compose exec postgres psql -U postgres -c "ALTER USER requiem RENAME TO <nouveau_nom>;"

# Option 2: Créer une nouvelle base et restaurer
docker-compose exec postgres pg_dump -U requiem requiem > backup.sql
docker-compose exec postgres createdb -U postgres <nouveau_nom>
docker-compose exec postgres psql -U postgres <nouveau_nom> < backup.sql
```

#### 2.5. Migrer les index OpenSearch

Les index OpenSearch utilisent le préfixe `requiem-case-*`. Vous devrez :

1. **Réindexer les données** (recommandé pour un nouveau projet)
2. **Ou renommer les index** (si vous avez déjà des données) :

```bash
# Lister les index existants
curl http://localhost:9200/_cat/indices/requiem-case-*

# Pour chaque index, créer un alias ou réindexer
# Exemple pour un index spécifique:
curl -X POST "http://localhost:9200/_reindex" -H 'Content-Type: application/json' -d'
{
  "source": {
    "index": "requiem-case-123"
  },
  "dest": {
    "index": "<nouveau_nom>-case-123"
  }
}'
```

#### 2.6. Mettre à jour les noms de domaines

Si vous utilisez Traefik avec des domaines personnalisés, mettez à jour :
- `docker-compose.prod.yml`
- `HTTPS_SETUP.md`
- Configuration DNS

#### 2.7. Vérifier les migrations Alembic

⚠️ **Important** : Les fichiers de migration Alembic ne sont **PAS** modifiés automatiquement pour préserver l'historique. Si vous avez besoin de les mettre à jour, faites-le manuellement dans `services/api/alembic/versions/`.

## 🔍 Vérification Post-Renommage

### Checklist de vérification

- [ ] Tous les conteneurs démarrent correctement
- [ ] L'API répond sur `/health`
- [ ] Le frontend se charge correctement
- [ ] Les connexions à la base de données fonctionnent
- [ ] OpenSearch est accessible
- [ ] Les index utilisent le nouveau préfixe
- [ ] L'interface affiche le nouveau nom
- [ ] Les emails (OTP, etc.) contiennent le nouveau nom
- [ ] La documentation est à jour

### Commandes de vérification

```bash
# Vérifier les conteneurs
docker-compose ps

# Vérifier l'API
curl http://localhost:8080/health

# Vérifier les index OpenSearch
curl http://localhost:9200/_cat/indices/<nouveau_nom>-case-*

# Vérifier la base de données
docker-compose exec postgres psql -U <nouveau_nom> -d <nouveau_nom> -c "\dt"
```

## 📝 Méthode Manuelle (Alternative)

Si vous préférez faire le renommage manuellement, voici les fichiers principaux à modifier :

### Fichiers de configuration Docker
- `docker-compose.yml`
- `docker-compose.prod.yml`
- `docker-compose.opensearch.yml`

### Fichiers de configuration du projet
- `frontend/package.json`
- `services/api/pyproject.toml`
- `Makefile`

### Fichiers de code source
- `services/api/app/config.py` (préfixe OpenSearch, OTP issuer)
- `services/api/app/main.py` (titre de l'API)
- `services/api/app/routers/auth.py` (OTP issuer)
- `services/api/app/routers/health.py` (nom du service)
- `frontend/src/components/BrandMark.tsx` (nom affiché)
- `frontend/src/views/LoginView.tsx` (texte de description)

### Documentation
- Tous les fichiers `.md` à la racine
- `README.md`
- Fichiers dans `services/api/` et `frontend/`

## ⚠️ Points d'attention

1. **Migrations Alembic** : Ne modifiez pas les migrations existantes sauf si vous êtes sûr de ce que vous faites
2. **Données existantes** : Sauvegardez avant de renommer si vous avez des données importantes
3. **Volumes Docker** : Les volumes Docker conservent les anciens noms. Vous devrez peut-être les recréer
4. **CI/CD** : Mettez à jour vos pipelines CI/CD si vous en avez
5. **Environnements multiples** : Répétez le processus pour chaque environnement (dev, staging, prod)

## 🆘 En cas de problème

Si quelque chose ne fonctionne pas après le renommage :

1. **Vérifiez les logs** :
   ```bash
   docker-compose logs api
   docker-compose logs frontend
   ```

2. **Vérifiez les variables d'environnement** :
   ```bash
   docker-compose exec api env | grep DM_
   ```

3. **Restaurer depuis un backup** :
   ```bash
   # Base de données
   docker-compose exec postgres psql -U <nouveau_nom> <nouveau_nom> < backup.sql
   ```

4. **Annuler le renommage** : Utilisez git pour restaurer les fichiers modifiés :
   ```bash
   git checkout -- .
   ```

## 📚 Ressources

- [Documentation Docker Compose](https://docs.docker.com/compose/)
- [Documentation OpenSearch Reindex](https://opensearch.org/docs/latest/api-reference/document-apis/reindex/)
- [Documentation PostgreSQL ALTER DATABASE](https://www.postgresql.org/docs/current/sql-alterdatabase.html)

---

**Note** : Ce guide suppose que vous utilisez le nom `Requiem` actuellement. Adaptez les exemples selon votre nouveau nom.

