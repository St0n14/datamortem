# Checklist Complète - Pré-Production Requiem

**Version** : 1.0  
**Date** : 2025-01-11  
**Objectif** : Document exhaustif de toutes les vérifications et actions à effectuer avant la mise en production

---

## 📋 Table des matières

1. [Infrastructure VPS](#1-infrastructure-vps)
2. [Configuration DNS](#2-configuration-dns)
3. [Sécurité et Secrets](#3-sécurité-et-secrets)
4. [Configuration Docker](#4-configuration-docker)
5. [Configuration HTTPS/TLS](#5-configuration-httpstls)
6. [Variables d'environnement](#6-variables-denvironnement)
7. [Configuration HedgeDoc](#7-configuration-hedgedoc)
8. [Vérifications pré-déploiement](#8-vérifications-pré-déploiement)
9. [Déploiement](#9-déploiement)
10. [Vérifications post-déploiement](#10-vérifications-post-déploiement)
11. [Sécurité finale](#11-sécurité-finale)
12. [Monitoring et Backups](#12-monitoring-et-backups)

---

## 1. Infrastructure VPS

### 1.1 Spécifications minimales

- [ ] **RAM** : Minimum 4GB (recommandé 8GB)
- [ ] **CPU** : Minimum 2 vCPU (recommandé 4 vCPU)
- [ ] **Disque** : Minimum 50GB SSD (recommandé 100GB+)
- [ ] **OS** : Ubuntu 22.04 LTS ou Debian 12 (recommandé)

### 1.2 Installation Docker et Docker Compose

```bash
# Vérifier que Docker est installé
docker --version
# Doit être >= 20.10

# Vérifier que Docker Compose est installé
docker compose version
# Doit être >= 2.0

# Si non installé, installer :
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Se déconnecter/reconnecter pour que les changements prennent effet
```

### 1.3 Configuration Firewall

```bash
# Vérifier le statut du firewall
sudo ufw status

# Ouvrir uniquement les ports nécessaires
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (pour Let's Encrypt)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Vérifier que les ports sont bien ouverts
sudo ufw status verbose
```

**Checklist** :
- [ ] Port 22 (SSH) ouvert
- [ ] Port 80 (HTTP) ouvert
- [ ] Port 443 (HTTPS) ouvert
- [ ] Tous les autres ports fermés
- [ ] Firewall activé

### 1.4 Configuration SSH sécurisée

```bash
# Vérifier la configuration SSH
sudo nano /etc/ssh/sshd_config

# Vérifier/Modifier :
# - PermitRootLogin no
# - PasswordAuthentication no (utiliser uniquement les clés SSH)
# - Port 22 (ou changer pour un port non-standard)

# Redémarrer SSH
sudo systemctl restart sshd
```

**Checklist** :
- [ ] Accès root désactivé
- [ ] Authentification par mot de passe désactivée (clés SSH uniquement)
- [ ] Clés SSH configurées pour l'utilisateur
- [ ] Port SSH changé (optionnel mais recommandé)

### 1.5 Utilisateur non-root avec accès Docker

```bash
# Créer un utilisateur (si pas déjà fait)
sudo adduser deploy
sudo usermod -aG docker deploy
sudo usermod -aG sudo deploy

# Vérifier l'accès Docker
su - deploy
docker ps
```

**Checklist** :
- [ ] Utilisateur non-root créé
- [ ] Utilisateur dans le groupe `docker`
- [ ] Accès Docker fonctionnel sans sudo

---

## 2. Configuration DNS

### 2.1 Réservation du nom de domaine

**Checklist** :
- [ ] Nom de domaine réservé/acheté
- [ ] Accès au panneau de configuration DNS obtenu
- [ ] Email de contact configuré (pour Let's Encrypt)

### 2.2 Configuration des enregistrements DNS

**Enregistrements à créer** :

```
Type    Name                    Value           TTL
A       mondomaine.tld          IP_VPS          3600
A       www.mondomaine.tld      IP_VPS          3600
A       hedgedoc.mondomaine.tld IP_VPS          3600
```

**Commandes de vérification** :

```bash
# Vérifier la résolution DNS
dig mondomaine.tld +short
# Doit retourner l'IP du VPS

dig www.mondomaine.tld +short
# Doit retourner l'IP du VPS

dig hedgedoc.mondomaine.tld +short
# Doit retourner l'IP du VPS

# Vérifier depuis un autre serveur (propagation)
nslookup mondomaine.tld 8.8.8.8
```

**Checklist** :
- [ ] Enregistrement A pour `mondomaine.tld` → IP du VPS
- [ ] Enregistrement A pour `www.mondomaine.tld` → IP du VPS
- [ ] Enregistrement A pour `hedgedoc.mondomaine.tld` → IP du VPS
- [ ] Propagation DNS vérifiée (peut prendre jusqu'à 48h, généralement < 1h)
- [ ] Tous les domaines résolvent vers la bonne IP

---

## 3. Sécurité et Secrets

### 3.1 Génération des secrets

```bash
# Créer le répertoire de travail
mkdir -p ~/requiem-deploy
cd ~/requiem-deploy

# Générer tous les secrets
JWT_SECRET=$(openssl rand -base64 48)
POSTGRES_PASSWORD=$(openssl rand -base64 32)
HEDGEDOC_DB_PASSWORD=$(openssl rand -base64 32)
OPENSEARCH_PASSWORD=$(openssl rand -base64 32)

# Afficher les secrets (à copier dans .env.prod)
echo "DM_JWT_SECRET=$JWT_SECRET"
echo "DM_POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
echo "DM_HEDGEDOC_DB_PASSWORD=$HEDGEDOC_DB_PASSWORD"
echo "DM_OPENSEARCH_PASSWORD=$OPENSEARCH_PASSWORD"

# Vérifier la longueur du JWT_SECRET (doit être >= 32)
echo -n "$JWT_SECRET" | wc -c
# Doit afficher >= 64 (base64 de 48 bytes)
```

**Checklist** :
- [ ] JWT_SECRET généré (minimum 32 caractères, recommandé 48+)
- [ ] POSTGRES_PASSWORD généré (minimum 16 caractères)
- [ ] HEDGEDOC_DB_PASSWORD généré (minimum 16 caractères)
- [ ] OPENSEARCH_PASSWORD généré (si sécurité activée)
- [ ] Tous les secrets sauvegardés de manière sécurisée (password manager)

### 3.2 Création du fichier `.env.prod`

```bash
# Créer le fichier .env.prod
cat > .env.prod << 'EOF'
# Environnement
DM_ENV=production

# Base de données PostgreSQL
DM_POSTGRES_PASSWORD=CHANGE_ME_GENERATE_RANDOM_PASSWORD
DM_DB_URL=postgresql://requiem:${DM_POSTGRES_PASSWORD}@postgres:5432/requiem

# Celery
DM_CELERY_BROKER=redis://redis:6379/0
DM_CELERY_BACKEND=redis://redis:6379/1

# JWT Secret (MINIMUM 32 caractères)
DM_JWT_SECRET=CHANGE_ME_GENERATE_RANDOM_SECRET_MIN_32_CHARS

# OpenSearch
DM_OPENSEARCH_HOST=opensearch
DM_OPENSEARCH_PORT=9200
DM_OPENSEARCH_SCHEME=http
DM_OPENSEARCH_USER=admin
DM_OPENSEARCH_PASSWORD=CHANGE_ME_IF_SECURITY_ENABLED

# CORS - RESTREINDRE AU DOMAINE PRODUCTION
DM_ALLOWED_ORIGINS=https://mondomaine.tld,https://www.mondomaine.tld

# Lake (stockage des preuves)
DM_LAKE_ROOT=/lake

# OTP/2FA
DM_ENABLE_OTP=true
DM_OTP_ISSUER=Requiem

# HedgeDoc
DM_HEDGEDOC_ENABLED=true
DM_HEDGEDOC_BASE_URL=http://hedgedoc:3000
DM_HEDGEDOC_PUBLIC_URL=https://hedgedoc.mondomaine.tld
DM_HEDGEDOC_DB_PASSWORD=CHANGE_ME_GENERATE_RANDOM_PASSWORD
DM_HEDGEDOC_DB_URL=postgres://hedgedoc:${DM_HEDGEDOC_DB_PASSWORD}@hedgedoc-db:5432/hedgedoc

# Email (si activé)
DM_ENABLE_EMAIL_VERIFICATION=false
# DM_SMTP_HOST=smtp.example.com
# DM_SMTP_PORT=587
# DM_SMTP_USERNAME=your_smtp_user
# DM_SMTP_PASSWORD=CHANGE_ME
# DM_EMAIL_SENDER=noreply@mondomaine.tld
# DM_EMAIL_VERIFICATION_BASE_URL=https://mondomaine.tld/verify-email
EOF

# Remplacer les placeholders avec les secrets générés
sed -i "s|DM_JWT_SECRET=.*|DM_JWT_SECRET=$JWT_SECRET|" .env.prod
sed -i "s|DM_POSTGRES_PASSWORD=.*|DM_POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" .env.prod
sed -i "s|DM_HEDGEDOC_DB_PASSWORD=.*|DM_HEDGEDOC_DB_PASSWORD=$HEDGEDOC_DB_PASSWORD|" .env.prod
sed -i "s|DM_OPENSEARCH_PASSWORD=.*|DM_OPENSEARCH_PASSWORD=$OPENSEARCH_PASSWORD|" .env.prod
sed -i "s|DM_DB_URL=.*|DM_DB_URL=postgresql://requiem:$POSTGRES_PASSWORD@postgres:5432/requiem|" .env.prod
sed -i "s|DM_HEDGEDOC_DB_URL=.*|DM_HEDGEDOC_DB_URL=postgres://hedgedoc:$HEDGEDOC_DB_PASSWORD@hedgedoc-db:5432/hedgedoc|" .env.prod

# Remplacer les domaines
sed -i "s|mondomaine.tld|VOTRE_DOMAINE_REEL|g" .env.prod

# Vérifier qu'aucun "CHANGE_ME" n'est resté
grep -i "change_me" .env.prod
# Ne doit rien retourner (sauf dans les commentaires)

# Vérifier les permissions du fichier
chmod 600 .env.prod
ls -la .env.prod
# Doit afficher -rw------- (lecture/écriture uniquement pour le propriétaire)
```

**Checklist** :
- [ ] Fichier `.env.prod` créé
- [ ] Tous les secrets remplacés (pas de "CHANGE_ME")
- [ ] Domaines remplacés par les vrais domaines
- [ ] Permissions du fichier : 600 (lecture/écriture propriétaire uniquement)
- [ ] Fichier sauvegardé de manière sécurisée (backup chiffré)

---

## 4. Configuration Docker

### 4.1 Préparation du code source

**Option A : Clone depuis Git (recommandé)**

```bash
# Cloner le repository
git clone https://github.com/votre-org/datamortem.git
cd datamortem

# Vérifier la branche
git branch
# Doit être sur la branche de production (main/master)

# Vérifier les fichiers nécessaires
ls -la docker-compose.prod.yml
ls -la .env.prod
ls -la services/api/Dockerfile
ls -la frontend/Dockerfile.prod
```

**Option B : Transfert manuel**

```bash
# Transférer les fichiers nécessaires via SCP
scp -r datamortem/ user@vps:/home/user/
```

**Checklist** :
- [ ] Code source présent sur le VPS
- [ ] Fichier `docker-compose.prod.yml` présent
- [ ] Fichier `.env.prod` présent et configuré
- [ ] Tous les Dockerfiles présents

### 4.2 Vérification de `docker-compose.prod.yml`

**Points à vérifier** :

1. **Traefik** : Configuration HTTPS prête (lignes décommentées)
2. **Tous les services** : Labels Traefik avec `Host()` et TLS
3. **Volumes** : Volume `letsencrypt` présent
4. **Restart policies** : `unless-stopped` sur tous les services
5. **Healthchecks** : Présents sur postgres, redis, opensearch

**Commandes de vérification** :

```bash
# Vérifier la présence du volume letsencrypt
grep -A 5 "volumes:" docker-compose.prod.yml | grep letsencrypt

# Vérifier les labels TLS sur les services
grep -A 10 "traefik.http.routers" docker-compose.prod.yml | grep -E "tls|letsencrypt"

# Vérifier les restart policies
grep "restart:" docker-compose.prod.yml
# Tous doivent être "unless-stopped"
```

**Checklist** :
- [ ] Volume `letsencrypt` présent dans la section volumes
- [ ] Labels TLS configurés sur tous les services (frontend, api, hedgedoc)
- [ ] Entrypoints HTTPS configurés dans Traefik
- [ ] Redirection HTTP → HTTPS configurée
- [ ] Email Let's Encrypt configuré (remplacer `admin@yourdomain.com`)
- [ ] Tous les `Host()` dans les labels utilisent les vrais domaines
- [ ] Restart policies configurées

---

## 5. Configuration HTTPS/TLS

### 5.1 Configuration Traefik

**Fichier** : `docker-compose.prod.yml`

**Section Traefik à vérifier** :

```yaml
traefik:
  command:
    - "--providers.docker=true"
    - "--providers.docker.exposedbydefault=false"
    - "--entrypoints.web.address=:80"
    - "--entrypoints.websecure.address=:443"  # ✅ DÉCOMMENTÉ
    - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"  # ✅ DÉCOMMENTÉ
    - "--certificatesresolvers.letsencrypt.acme.email=admin@mondomaine.tld"  # ✅ MODIFIÉ
    - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"  # ✅ DÉCOMMENTÉ
    - "--entrypoints.web.http.redirections.entrypoint.to=websecure"  # ✅ DÉCOMMENTÉ
    - "--entrypoints.web.http.redirections.entrypoint.scheme=https"  # ✅ DÉCOMMENTÉ
    - "--api.dashboard=true"
    - "--api.insecure=false"  # ✅ CHANGÉ (sécurisé)
    - "--log.level=INFO"
  ports:
    - "80:80"
    - "443:443"  # ✅ DÉCOMMENTÉ
    - "8080:8080"  # Dashboard (protégé)
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - letsencrypt:/letsencrypt  # ✅ DÉCOMMENTÉ
```

**Checklist** :
- [ ] Entrypoint HTTPS (443) configuré
- [ ] Let's Encrypt configuré avec TLS Challenge
- [ ] Email Let's Encrypt remplacé par votre email
- [ ] Redirection HTTP → HTTPS activée
- [ ] Volume letsencrypt monté
- [ ] Port 443 exposé
- [ ] Dashboard Traefik sécurisé (`--api.insecure=false`)

### 5.2 Labels Traefik pour chaque service

**Frontend** :

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.frontend.rule=Host(`mondomaine.tld`) || Host(`www.mondomaine.tld`)"  # ✅ MODIFIÉ
  - "traefik.http.routers.frontend.entrypoints=web,websecure"  # ✅ MODIFIÉ
  - "traefik.http.routers.frontend.priority=1"
  - "traefik.http.routers.frontend.tls=true"  # ✅ DÉCOMMENTÉ
  - "traefik.http.routers.frontend.tls.certresolver=letsencrypt"  # ✅ DÉCOMMENTÉ
  - "traefik.http.services.frontend.loadbalancer.server.port=80"
```

**API** :

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.api.rule=Host(`mondomaine.tld`) && (PathPrefix(`/api`) || PathPrefix(`/docs`) || PathPrefix(`/redoc`))"  # ✅ MODIFIÉ
  - "traefik.http.routers.api.entrypoints=web,websecure"  # ✅ MODIFIÉ
  - "traefik.http.routers.api.priority=100"
  - "traefik.http.routers.api.tls=true"  # ✅ DÉCOMMENTÉ
  - "traefik.http.routers.api.tls.certresolver=letsencrypt"  # ✅ DÉCOMMENTÉ
  - "traefik.http.services.api.loadbalancer.server.port=8000"
```

**HedgeDoc** :

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.hedgedoc.rule=Host(`hedgedoc.mondomaine.tld`)"  # ✅ MODIFIÉ (sous-domaine)
  - "traefik.http.routers.hedgedoc.entrypoints=web,websecure"  # ✅ MODIFIÉ
  - "traefik.http.routers.hedgedoc.tls=true"  # ✅ DÉCOMMENTÉ
  - "traefik.http.routers.hedgedoc.tls.certresolver=letsencrypt"  # ✅ DÉCOMMENTÉ
  - "traefik.http.services.hedgedoc.loadbalancer.server.port=3000"
```

**Checklist** :
- [ ] Frontend : Host() avec votre domaine
- [ ] API : Host() avec votre domaine + PathPrefix
- [ ] HedgeDoc : Host() avec sous-domaine hedgedoc
- [ ] Tous les services : entrypoints `web,websecure`
- [ ] Tous les services : TLS activé avec letsencrypt

### 5.3 Configuration Nginx (Frontend)

**Fichier** : `frontend/nginx.conf`

**Modifications à faire** :

```nginx
# Activer HSTS (décommenter)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

# Mettre à jour CSP avec votre domaine
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://mondomaine.tld/api; frame-ancestors 'self';" always;
```

**Checklist** :
- [ ] HSTS activé (ligne décommentée)
- [ ] CSP mis à jour avec votre domaine
- [ ] Tous les headers de sécurité présents

---

## 6. Variables d'environnement

### 6.1 Vérification complète de `.env.prod`

```bash
# Vérifier que tous les secrets sont présents
grep -E "DM_JWT_SECRET|DM_POSTGRES_PASSWORD|DM_HEDGEDOC_DB_PASSWORD" .env.prod

# Vérifier qu'aucun placeholder n'est resté
grep -iE "change_me|yourdomain|localhost" .env.prod | grep -v "^#"
# Ne doit rien retourner (sauf dans les commentaires)

# Vérifier les domaines
grep -E "DM_ALLOWED_ORIGINS|DM_HEDGEDOC_PUBLIC_URL" .env.prod
# Doit contenir vos vrais domaines HTTPS
```

**Checklist** :
- [ ] `DM_ENV=production`
- [ ] `DM_JWT_SECRET` : Secret généré (>= 32 caractères)
- [ ] `DM_POSTGRES_PASSWORD` : Mot de passe généré
- [ ] `DM_HEDGEDOC_DB_PASSWORD` : Mot de passe généré
- [ ] `DM_ALLOWED_ORIGINS` : Domaines HTTPS de production uniquement
- [ ] `DM_HEDGEDOC_PUBLIC_URL` : `https://hedgedoc.mondomaine.tld`
- [ ] `DM_DB_URL` : Utilise le mot de passe généré
- [ ] `DM_HEDGEDOC_DB_URL` : Utilise le mot de passe généré
- [ ] Aucun placeholder restant

### 6.2 Configuration Frontend

**Fichier** : `frontend/.env.production` (créer si n'existe pas)

```bash
# Créer le fichier
cat > frontend/.env.production << 'EOF'
VITE_API_URL=https://mondomaine.tld/api
EOF

# Remplacer le domaine
sed -i "s|mondomaine.tld|VOTRE_DOMAINE_REEL|g" frontend/.env.production
```

**Checklist** :
- [ ] Fichier `frontend/.env.production` créé
- [ ] `VITE_API_URL` pointe vers `https://mondomaine.tld/api`

---

## 7. Configuration HedgeDoc

### 7.1 Configuration HedgeDoc dans `docker-compose.prod.yml`

**Section HedgeDoc à vérifier** :

```yaml
hedgedoc:
  environment:
    - CMD_DB_URL=${DM_HEDGEDOC_DB_URL}
    - CMD_ALLOW_FREEURL=true
    - CMD_ALLOW_ANONYMOUS=true
    - CMD_ALLOW_ANONYMOUS_EDITS=false
    - CMD_DEFAULT_PERMISSION=limited
    - CMD_PROTOCOL_USESSL=true  # ✅ HTTPS activé
    - CMD_DOMAIN=hedgedoc.mondomaine.tld  # ✅ Sous-domaine
    # CMD_URL_PATH n'est plus nécessaire avec sous-domaine
    - CMD_EMAIL=false
```

**Checklist** :
- [ ] `CMD_PROTOCOL_USESSL=true` (HTTPS activé)
- [ ] `CMD_DOMAIN=hedgedoc.mondomaine.tld` (sous-domaine)
- [ ] `CMD_URL_PATH` retiré (pas nécessaire avec sous-domaine)
- [ ] `CMD_DB_URL` utilise la variable d'environnement

### 7.2 Variables HedgeDoc dans `.env.prod`

```bash
# Vérifier les variables HedgeDoc
grep HEDGEDOC .env.prod

# Doit contenir :
# DM_HEDGEDOC_ENABLED=true
# DM_HEDGEDOC_BASE_URL=http://hedgedoc:3000 (interne)
# DM_HEDGEDOC_PUBLIC_URL=https://hedgedoc.mondomaine.tld (public)
```

**Checklist** :
- [ ] `DM_HEDGEDOC_ENABLED=true`
- [ ] `DM_HEDGEDOC_BASE_URL=http://hedgedoc:3000` (URL interne)
- [ ] `DM_HEDGEDOC_PUBLIC_URL=https://hedgedoc.mondomaine.tld` (URL publique)

---

## 8. Vérifications pré-déploiement

### 8.1 Vérification DNS finale

```bash
# Vérifier depuis le VPS
dig mondomaine.tld +short
dig www.mondomaine.tld +short
dig hedgedoc.mondomaine.tld +short

# Tous doivent retourner l'IP du VPS
```

**Checklist** :
- [ ] DNS propagé (tous les domaines pointent vers l'IP du VPS)
- [ ] Vérifié depuis plusieurs serveurs DNS (8.8.8.8, 1.1.1.1)

### 8.2 Vérification des ports

```bash
# Vérifier que les ports sont ouverts
sudo netstat -tulpn | grep -E ':80|:443|:22'

# Ou avec ss
sudo ss -tulpn | grep -E ':80|:443|:22'
```

**Checklist** :
- [ ] Port 80 accessible
- [ ] Port 443 accessible
- [ ] Port 22 accessible (SSH)

### 8.3 Vérification de l'espace disque

```bash
# Vérifier l'espace disque disponible
df -h

# Vérifier l'espace inode
df -i
```

**Checklist** :
- [ ] Au moins 20GB d'espace libre
- [ ] Au moins 10% d'inodes libres

### 8.4 Vérification des ressources système

```bash
# Vérifier la RAM disponible
free -h

# Vérifier la charge CPU
uptime
```

**Checklist** :
- [ ] Au moins 4GB RAM disponible
- [ ] Charge CPU < 1.0

---

## 9. Déploiement

### 9.1 Build des images Docker

```bash
# Se placer dans le répertoire du projet
cd ~/requiem-deploy/datamortem

# Builder l'image API
docker build -t requiem-api:latest ./services/api

# Builder l'image Frontend
docker build -f frontend/Dockerfile.prod -t requiem-frontend:latest ./frontend

# Vérifier que les images sont créées
docker images | grep requiem
```

**Checklist** :
- [ ] Image `requiem-api:latest` créée
- [ ] Image `requiem-frontend:latest` créée
- [ ] Aucune erreur lors du build

### 9.2 Démarrage de la stack

```bash
# Démarrer la stack
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Vérifier que tous les services sont démarrés
docker compose -f docker-compose.prod.yml ps

# Tous les services doivent être "Up" et "healthy" (si healthcheck configuré)
```

**Checklist** :
- [ ] Tous les services démarrés
- [ ] Aucune erreur dans les logs
- [ ] Services avec healthcheck sont "healthy"

### 9.3 Application des migrations

```bash
# Attendre que la base de données soit prête (30 secondes)
sleep 30

# Appliquer les migrations Alembic
docker compose -f docker-compose.prod.yml exec api uv run alembic upgrade head

# Vérifier le statut des migrations
docker compose -f docker-compose.prod.yml exec api uv run alembic current
```

**Checklist** :
- [ ] Migrations appliquées sans erreur
- [ ] Base de données à jour

### 9.4 Création de l'utilisateur admin

```bash
# Créer l'utilisateur admin initial
docker compose -f docker-compose.prod.yml exec api uv run python -m app.init_admin

# Note : Suivre les instructions pour créer le compte admin
```

**Checklist** :
- [ ] Utilisateur admin créé
- [ ] Identifiants sauvegardés de manière sécurisée

---

## 10. Vérifications post-déploiement

### 10.1 Vérification des certificats SSL

```bash
# Vérifier les logs Traefik pour la génération des certificats
docker compose -f docker-compose.prod.yml logs traefik | grep -i certificate

# Doit contenir des messages comme :
# "Certificate obtained from ACME"
# "Adding route for ..."
```

**Checklist** :
- [ ] Certificats SSL générés pour tous les domaines
- [ ] Aucune erreur dans les logs Traefik

### 10.2 Tests d'accès HTTPS

```bash
# Tester le frontend
curl -I https://mondomaine.tld
# Doit retourner HTTP/2 200

# Tester l'API
curl -I https://mondomaine.tld/api/health
# Doit retourner HTTP/2 200

# Tester HedgeDoc
curl -I https://hedgedoc.mondomaine.tld
# Doit retourner HTTP/2 200

# Vérifier la redirection HTTP → HTTPS
curl -I http://mondomaine.tld
# Doit retourner HTTP/1.1 308 Permanent Redirect
# Location: https://mondomaine.tld/
```

**Checklist** :
- [ ] Frontend accessible en HTTPS
- [ ] API accessible en HTTPS
- [ ] HedgeDoc accessible en HTTPS
- [ ] Redirection HTTP → HTTPS fonctionne
- [ ] Certificats valides (pas d'erreur dans le navigateur)

### 10.3 Vérification des healthchecks

```bash
# Healthcheck API
curl https://mondomaine.tld/api/health
# Doit retourner {"status":"healthy"}

# Healthcheck Frontend
curl https://mondomaine.tld/health
# Doit retourner "healthy"
```

**Checklist** :
- [ ] Healthcheck API fonctionne
- [ ] Healthcheck Frontend fonctionne
- [ ] Réponses correctes

### 10.4 Tests fonctionnels

```bash
# Test de connexion
curl -X POST https://mondomaine.tld/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"votre_mot_de_passe"}'

# Test de recherche (si authentifié)
curl -X GET https://mondomaine.tld/api/search?q=test \
  -H "Authorization: Bearer VOTRE_TOKEN"
```

**Checklist** :
- [ ] Connexion fonctionne
- [ ] API répond correctement
- [ ] Recherche fonctionne (si testé)

### 10.5 Vérification HedgeDoc

```bash
# Tester l'accès HedgeDoc
curl -I https://hedgedoc.mondomaine.tld

# Vérifier que l'API peut créer des notes
# (via l'interface web, créer un case et vérifier le lien HedgeDoc)
```

**Checklist** :
- [ ] HedgeDoc accessible
- [ ] Création de notes fonctionne
- [ ] Intégration avec l'API fonctionne

---

## 11. Sécurité finale

### 11.1 Sécurisation du dashboard Traefik

**Option A : Désactiver complètement**

```yaml
# Dans docker-compose.prod.yml, retirer :
# - "--api.dashboard=true"
# - "--api.insecure=false"
# Et retirer le port 8080
```

**Option B : Protéger avec Basic Auth**

```bash
# Générer le hash htpasswd
echo $(htpasswd -nb admin VOTRE_MOT_DE_PASSE) | sed -e s/\\$/\\$\\$/g

# Ajouter dans docker-compose.prod.yml :
labels:
  - "traefik.http.middlewares.traefik-auth.basicauth.users=admin:$$apr1$$..."
  - "traefik.http.routers.dashboard.middlewares=traefik-auth"
```

**Checklist** :
- [ ] Dashboard Traefik sécurisé ou désactivé
- [ ] Port 8080 non accessible depuis l'extérieur (firewall)

### 11.2 Vérification CORS

```bash
# Vérifier la configuration CORS
grep DM_ALLOWED_ORIGINS .env.prod

# Doit contenir uniquement vos domaines de production
# Exemple : https://mondomaine.tld,https://www.mondomaine.tld
```

**Checklist** :
- [ ] CORS restreint aux domaines de production uniquement
- [ ] Aucun wildcard ou localhost en production

### 11.3 Vérification des headers de sécurité

```bash
# Tester les headers
curl -I https://mondomaine.tld | grep -iE "x-frame|content-security|strict-transport"

# Doit contenir :
# X-Frame-Options: SAMEORIGIN
# Content-Security-Policy: ...
# Strict-Transport-Security: ...
```

**Checklist** :
- [ ] Headers de sécurité présents
- [ ] HSTS activé
- [ ] CSP configuré correctement

### 11.4 Vérification des secrets

```bash
# Vérifier qu'aucun secret n'est dans les logs
docker compose -f docker-compose.prod.yml logs | grep -iE "password|secret|jwt"

# Ne doit pas afficher de secrets en clair
```

**Checklist** :
- [ ] Aucun secret dans les logs
- [ ] Fichier `.env.prod` avec permissions 600
- [ ] Secrets sauvegardés de manière sécurisée

---

## 12. Monitoring et Backups

### 12.1 Configuration des backups

```bash
# Créer un script de backup
cat > ~/backup-requiem.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/deploy/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup PostgreSQL Requiem
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U requiem requiem > $BACKUP_DIR/requiem_$DATE.sql

# Backup PostgreSQL HedgeDoc
docker compose -f docker-compose.prod.yml exec -T hedgedoc-db \
  pg_dump -U hedgedoc hedgedoc > $BACKUP_DIR/hedgedoc_$DATE.sql

# Backup volumes (optionnel)
docker run --rm \
  -v requiem_lake-data:/data \
  -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/lake_$DATE.tar.gz /data

# Nettoyer les backups de plus de 30 jours
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

chmod +x ~/backup-requiem.sh

# Tester le backup
~/backup-requiem.sh

# Configurer un cron job (backup quotidien à 2h du matin)
(crontab -l 2>/dev/null; echo "0 2 * * * /home/deploy/backup-requiem.sh") | crontab -
```

**Checklist** :
- [ ] Script de backup créé
- [ ] Backup testé et fonctionnel
- [ ] Cron job configuré pour backups automatiques
- [ ] Répertoire de backup avec espace suffisant

### 12.2 Monitoring de base

```bash
# Vérifier les logs des services
docker compose -f docker-compose.prod.yml logs --tail=100

# Vérifier l'utilisation des ressources
docker stats --no-stream

# Vérifier l'espace disque des volumes
docker system df -v
```

**Checklist** :
- [ ] Logs accessibles et lisibles
- [ ] Surveillance de l'utilisation des ressources
- [ ] Surveillance de l'espace disque

### 12.3 Alertes de base

**À configurer manuellement** :

- [ ] Alertes disque plein (via monitoring ou cron)
- [ ] Alertes services down (via healthcheck ou monitoring)
- [ ] Alertes certificats SSL expirant (Let's Encrypt renouvelle automatiquement, mais surveiller)

---

## 📝 Checklist finale globale

### Avant le déploiement
- [ ] VPS configuré (Docker, firewall, SSH)
- [ ] DNS configuré et propagé
- [ ] Secrets générés et sauvegardés
- [ ] `.env.prod` configuré et vérifié
- [ ] `docker-compose.prod.yml` configuré pour HTTPS
- [ ] Nginx configuré (HSTS, CSP)
- [ ] Tous les domaines résolvent correctement

### Déploiement
- [ ] Images Docker buildées
- [ ] Stack démarrée sans erreur
- [ ] Migrations appliquées
- [ ] Utilisateur admin créé

### Après le déploiement
- [ ] Certificats SSL générés
- [ ] Tous les services accessibles en HTTPS
- [ ] Redirection HTTP → HTTPS fonctionne
- [ ] Healthchecks fonctionnent
- [ ] Tests fonctionnels passés
- [ ] HedgeDoc accessible et fonctionnel

### Sécurité
- [ ] Dashboard Traefik sécurisé
- [ ] CORS restreint
- [ ] Headers de sécurité présents
- [ ] Secrets sécurisés
- [ ] Firewall configuré

### Opérations
- [ ] Backups configurés
- [ ] Monitoring de base en place
- [ ] Documentation à jour

---

## 🚨 En cas de problème

### Certificats SSL non générés

```bash
# Vérifier les logs Traefik
docker compose -f docker-compose.prod.yml logs traefik

# Vérifier le DNS
dig mondomaine.tld

# Vérifier les ports
sudo netstat -tulpn | grep -E ':80|:443'
```

### Services ne démarrent pas

```bash
# Vérifier les logs
docker compose -f docker-compose.prod.yml logs <service_name>

# Vérifier les variables d'environnement
docker compose -f docker-compose.prod.yml config

# Vérifier les dépendances
docker compose -f docker-compose.prod.yml ps
```

### Erreurs de connexion base de données

```bash
# Vérifier que PostgreSQL est démarré
docker compose -f docker-compose.prod.yml ps postgres

# Vérifier les logs PostgreSQL
docker compose -f docker-compose.prod.yml logs postgres

# Tester la connexion
docker compose -f docker-compose.prod.yml exec api python -c "from app.db import engine; engine.connect()"
```

---

## 📚 Ressources

- [PRODUCTION.md](./PRODUCTION.md) : Guide de déploiement détaillé
- [HTTPS_SETUP.md](./HTTPS_SETUP.md) : Configuration HTTPS
- [SECURITY_PROD_CHECKLIST.md](./SECURITY_PROD_CHECKLIST.md) : Checklist sécurité
- [HTTP_TO_HTTPS_MIGRATION.md](./HTTP_TO_HTTPS_MIGRATION.md) : Migration HTTP → HTTPS

---

**Version** : 1.0  
**Dernière mise à jour** : 2025-01-11  
**Auteur** : Requiem DevOps Team

