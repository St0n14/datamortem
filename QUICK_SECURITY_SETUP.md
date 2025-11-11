# Guide Rapide - Sécurité Production

## 🚀 Démarrage rapide (30 minutes)

### Étape 1 : Créer le fichier `.env.prod`

```bash
# Créer le fichier depuis le template
cat > .env.prod << 'EOF'
DM_ENV=production
DM_POSTGRES_PASSWORD=$(openssl rand -base64 32)
DM_JWT_SECRET=$(openssl rand -base64 48)
DM_HEDGEDOC_DB_PASSWORD=$(openssl rand -base64 32)
DM_OPENSEARCH_PASSWORD=$(openssl rand -base64 32)
DM_ALLOWED_ORIGINS=https://yourdomain.com
DM_HEDGEDOC_PUBLIC_URL=https://yourdomain.com/hedgedoc
DM_ENABLE_OTP=true
DM_HEDGEDOC_ENABLED=true
DM_HEDGEDOC_BASE_URL=http://hedgedoc:3000
DM_DB_URL=postgresql://datamortem:${DM_POSTGRES_PASSWORD}@postgres:5432/datamortem
DM_CELERY_BROKER=redis://redis:6379/0
DM_CELERY_BACKEND=redis://redis:6379/1
DM_OPENSEARCH_HOST=opensearch
DM_OPENSEARCH_PORT=9200
DM_OPENSEARCH_SCHEME=http
DM_LAKE_ROOT=/lake
EOF

# Générer les secrets et remplacer dans le fichier
JWT_SECRET=$(openssl rand -base64 48)
POSTGRES_PWD=$(openssl rand -base64 32)
HEDGEDOC_PWD=$(openssl rand -base64 32)
OPENSEARCH_PWD=$(openssl rand -base64 32)

# Éditer le fichier et remplacer les placeholders
sed -i.bak "s|DM_JWT_SECRET=.*|DM_JWT_SECRET=$JWT_SECRET|" .env.prod
sed -i.bak "s|DM_POSTGRES_PASSWORD=.*|DM_POSTGRES_PASSWORD=$POSTGRES_PWD|" .env.prod
sed -i.bak "s|DM_HEDGEDOC_DB_PASSWORD=.*|DM_HEDGEDOC_DB_PASSWORD=$HEDGEDOC_PWD|" .env.prod
sed -i.bak "s|DM_OPENSEARCH_PASSWORD=.*|DM_OPENSEARCH_PASSWORD=$OPENSEARCH_PWD|" .env.prod
sed -i.bak "s|DM_DB_URL=.*|DM_DB_URL=postgresql://datamortem:$POSTGRES_PWD@postgres:5432/datamortem|" .env.prod

# Vérifier que le fichier est bien créé
cat .env.prod
```

### Étape 2 : Vérifier les secrets

```bash
# Vérifier que JWT_SECRET fait au moins 32 caractères
grep DM_JWT_SECRET .env.prod | wc -c
# Doit être > 50 (incluant "DM_JWT_SECRET=")

# Vérifier qu'aucun "CHANGE_ME" n'est resté
grep -i "change_me" .env.prod
# Ne doit rien retourner
```

### Étape 3 : Mettre à jour CORS

Éditer `.env.prod` et remplacer :
```bash
DM_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### Étape 4 : Sécuriser Traefik Dashboard

Modifier `docker-compose.prod.yml` :
```yaml
traefik:
  command:
    - "--providers.docker=true"
    - "--providers.docker.exposedbydefault=false"
    - "--entrypoints.web.address=:80"
    - "--entrypoints.websecure.address=:443"
    - "--api.dashboard=true"
    - "--api.insecure=false"  # ⚠️ CHANGER ICI
```

### Étape 5 : Activer HTTPS (Let's Encrypt)

Ajouter dans `docker-compose.prod.yml` pour Traefik :
```yaml
traefik:
  command:
    # ... autres commandes ...
    - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
    - "--certificatesresolvers.letsencrypt.acme.email=admin@yourdomain.com"
    - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - letsencrypt:/letsencrypt
```

### Étape 6 : Vérifier les headers de sécurité

Les headers de sécurité ont été ajoutés dans `frontend/nginx.conf`. Vérifier que le CSP est adapté à votre configuration.

---

## ✅ Checklist rapide

- [ ] `.env.prod` créé avec secrets générés
- [ ] `DM_JWT_SECRET` fait au moins 32 caractères
- [ ] `DM_ALLOWED_ORIGINS` restreint au domaine production
- [ ] Traefik dashboard sécurisé (`--api.insecure=false`)
- [ ] HTTPS configuré (Let's Encrypt)
- [ ] Headers de sécurité Nginx activés
- [ ] Rate limiting à implémenter (voir SECURITY_PROD_CHECKLIST.md)

---

## 📚 Documentation complète

Voir `SECURITY_PROD_CHECKLIST.md` pour la liste complète des étapes.

