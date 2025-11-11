# Guide Migration HTTP → HTTPS - dataMortem

**Date** : 2025-01-11  
**Objectif** : Passer de HTTP (local) à HTTPS (production) avec Let's Encrypt

Ce guide explique comment activer HTTPS quand vous aurez un domaine, en partant de la configuration HTTP actuelle.

---

## 📋 État actuel vs Production

### Configuration actuelle (HTTP - Local)
- ✅ Traefik sur port 80 uniquement
- ✅ Services accessibles via HTTP
- ✅ Pas de certificats SSL
- ✅ Pas de redirection HTTPS

### Configuration cible (HTTPS - Production)
- ✅ Traefik sur ports 80 et 443
- ✅ Let's Encrypt pour certificats SSL
- ✅ Redirection automatique HTTP → HTTPS
- ✅ HSTS activé
- ✅ Tous les services en HTTPS

---

## 🔄 Étapes de migration

### Étape 1 : Préparer le domaine

#### 1.1 Configurer le DNS

Assurez-vous que votre domaine pointe vers votre serveur :

```bash
# Vérifier le DNS
dig votre-domaine.com
# ou
nslookup votre-domaine.com

# Doit retourner l'IP de votre serveur
```

**Configuration DNS recommandée** :
```
Type    Name                    Value           TTL
A       datamortem.example.com  123.45.67.89    3600
A       www.datamortem.example.com  123.45.67.89    3600
```

#### 1.2 Vérifier le firewall

Les ports 80 et 443 doivent être ouverts :

```bash
# Vérifier les ports
sudo ufw status
# ou
sudo iptables -L -n | grep -E '80|443'

# Ouvrir les ports si nécessaire
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

### Étape 2 : Modifier `docker-compose.prod.yml`

#### 2.1 Configuration Traefik

**Fichier** : `docker-compose.prod.yml`

**Section** : `traefik` → `command`

**Modifications à faire** :

```yaml
traefik:
  command:
    - "--providers.docker=true"
    - "--providers.docker.exposedbydefault=false"
    - "--entrypoints.web.address=:80"
    # ✅ DÉCOMMENTER ces lignes pour activer HTTPS
    - "--entrypoints.websecure.address=:443"
    - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
    - "--certificatesresolvers.letsencrypt.acme.email=admin@votre-domaine.com"  # ⚠️ REMPLACER
    - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    # ✅ AJOUTER la redirection HTTP → HTTPS
    - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
    - "--entrypoints.web.http.redirections.entrypoint.scheme=https"
    - "--api.dashboard=true"
    - "--api.insecure=true"
    - "--log.level=INFO"
  ports:
    - "80:80"
    - "443:443"  # ✅ DÉCOMMENTER
    - "8080:8080"
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - letsencrypt:/letsencrypt  # ✅ DÉCOMMENTER
```

#### 2.2 Ajouter le volume `letsencrypt`

**Section** : `volumes` (à la fin du fichier)

```yaml
volumes:
  postgres-data:
  redis-data:
  opensearch-data:
  lake-data:
  hedgedoc-db-data:
  hedgedoc-uploads:
  letsencrypt:  # ✅ AJOUTER cette ligne
```

#### 2.3 Modifier les labels des services

Pour chaque service (frontend, api, hedgedoc, opensearch, dashboards), modifier les labels :

##### Frontend

**Avant** (HTTP) :
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.frontend.rule=PathPrefix(`/`)"
  - "traefik.http.routers.frontend.entrypoints=web"
  - "traefik.http.routers.frontend.priority=1"
  - "traefik.http.services.frontend.loadbalancer.server.port=80"
```

**Après** (HTTPS) :
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.frontend.rule=Host(`votre-domaine.com`)"  # ✅ AJOUTER Host()
  - "traefik.http.routers.frontend.entrypoints=web,websecure"  # ✅ AJOUTER websecure
  - "traefik.http.routers.frontend.priority=1"
  - "traefik.http.routers.frontend.tls=true"  # ✅ AJOUTER
  - "traefik.http.routers.frontend.tls.certresolver=letsencrypt"  # ✅ AJOUTER
  - "traefik.http.services.frontend.loadbalancer.server.port=80"
```

##### API

**Avant** (HTTP) :
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.api.rule=PathPrefix(`/api`) || PathPrefix(`/docs`) || PathPrefix(`/redoc`) || PathPrefix(`/openapi.json`)"
  - "traefik.http.routers.api.entrypoints=web"
  - "traefik.http.routers.api.priority=100"
  - "traefik.http.services.api.loadbalancer.server.port=8000"
```

**Après** (HTTPS) :
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.api.rule=Host(`votre-domaine.com`) && (PathPrefix(`/api`) || PathPrefix(`/docs`) || PathPrefix(`/redoc`) || PathPrefix(`/openapi.json`))"  # ✅ AJOUTER Host()
  - "traefik.http.routers.api.entrypoints=web,websecure"  # ✅ AJOUTER websecure
  - "traefik.http.routers.api.priority=100"
  - "traefik.http.routers.api.tls=true"  # ✅ AJOUTER
  - "traefik.http.routers.api.tls.certresolver=letsencrypt"  # ✅ AJOUTER
  - "traefik.http.services.api.loadbalancer.server.port=8000"
```

##### HedgeDoc

**Avant** (HTTP) :
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.hedgedoc.rule=PathPrefix(`/hedgedoc`)"
  - "traefik.http.routers.hedgedoc.entrypoints=web"
  - "traefik.http.services.hedgedoc.loadbalancer.server.port=3000"
```

**Après** (HTTPS) :
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.hedgedoc.rule=Host(`votre-domaine.com`) && PathPrefix(`/hedgedoc`)"  # ✅ AJOUTER Host()
  - "traefik.http.routers.hedgedoc.entrypoints=web,websecure"  # ✅ AJOUTER websecure
  - "traefik.http.routers.hedgedoc.tls=true"  # ✅ AJOUTER
  - "traefik.http.routers.hedgedoc.tls.certresolver=letsencrypt"  # ✅ AJOUTER
  - "traefik.http.services.hedgedoc.loadbalancer.server.port=3000"
```

##### OpenSearch

**Avant** (HTTP) :
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.opensearch.rule=PathPrefix(`/opensearch`)"
  - "traefik.http.routers.opensearch.entrypoints=web"
  - "traefik.http.services.opensearch.loadbalancer.server.port=9200"
  - "traefik.http.middlewares.opensearch-stripprefix.stripprefix.prefixes=/opensearch"
  - "traefik.http.routers.opensearch.middlewares=opensearch-stripprefix"
```

**Après** (HTTPS) :
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.opensearch.rule=Host(`votre-domaine.com`) && PathPrefix(`/opensearch`)"  # ✅ AJOUTER Host()
  - "traefik.http.routers.opensearch.entrypoints=web,websecure"  # ✅ AJOUTER websecure
  - "traefik.http.routers.opensearch.tls=true"  # ✅ AJOUTER
  - "traefik.http.routers.opensearch.tls.certresolver=letsencrypt"  # ✅ AJOUTER
  - "traefik.http.services.opensearch.loadbalancer.server.port=9200"
  - "traefik.http.middlewares.opensearch-stripprefix.stripprefix.prefixes=/opensearch"
  - "traefik.http.routers.opensearch.middlewares=opensearch-stripprefix"
```

##### Dashboards

**Avant** (HTTP) :
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.dashboards.rule=PathPrefix(`/dashboards`)"
  - "traefik.http.routers.dashboards.entrypoints=web"
  - "traefik.http.services.dashboards.loadbalancer.server.port=5601"
```

**Après** (HTTPS) :
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.dashboards.rule=Host(`votre-domaine.com`) && PathPrefix(`/dashboards`)"  # ✅ AJOUTER Host()
  - "traefik.http.routers.dashboards.entrypoints=web,websecure"  # ✅ AJOUTER websecure
  - "traefik.http.routers.dashboards.tls=true"  # ✅ AJOUTER
  - "traefik.http.routers.dashboards.tls.certresolver=letsencrypt"  # ✅ AJOUTER
  - "traefik.http.services.dashboards.loadbalancer.server.port=5601"
```

---

### Étape 3 : Mettre à jour `.env.prod`

**Fichier** : `.env.prod`

**Modifications** :

```bash
# Avant (HTTP)
DM_ALLOWED_ORIGINS=http://localhost,http://127.0.0.1
DM_HEDGEDOC_PUBLIC_URL=http://localhost/hedgedoc
DM_EMAIL_VERIFICATION_BASE_URL=http://localhost/verify-email

# Après (HTTPS) - ✅ MODIFIER
DM_ALLOWED_ORIGINS=https://votre-domaine.com,https://www.votre-domaine.com
DM_HEDGEDOC_PUBLIC_URL=https://votre-domaine.com/hedgedoc
DM_EMAIL_VERIFICATION_BASE_URL=https://votre-domaine.com/verify-email
```

---

### Étape 4 : Activer HSTS dans Nginx

**Fichier** : `frontend/nginx.conf`

**Modification** :

```nginx
# Avant (commenté)
# add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

# Après - ✅ DÉCOMMENTER
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

---

### Étape 5 : Mettre à jour le CSP dans Nginx

**Fichier** : `frontend/nginx.conf`

**Modification** :

```nginx
# Avant
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://yourdomain.com/api; frame-ancestors 'self';" always;

# Après - ✅ REMPLACER yourdomain.com
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://votre-domaine.com/api; frame-ancestors 'self';" always;
```

---

### Étape 6 : Redémarrer la stack

```bash
# Arrêter la stack
docker-compose -f docker-compose.prod.yml down

# Redémarrer avec HTTPS
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Vérifier les logs Traefik pour voir la génération du certificat
docker-compose -f docker-compose.prod.yml logs -f traefik
```

---

## ✅ Vérification

### 1. Vérifier la génération du certificat

Dans les logs Traefik, vous devriez voir :
```
time="..." level=info msg="Certificate obtained from ACME" resolverName=letsencrypt
time="..." level=info msg="Adding route for ..." entryPointName=websecure
```

### 2. Tester HTTPS

```bash
# Tester depuis votre machine
curl -I https://votre-domaine.com

# Vérifier le certificat
openssl s_client -connect votre-domaine.com:443 -servername votre-domaine.com
```

### 3. Vérifier la redirection HTTP → HTTPS

```bash
# Doit rediriger vers HTTPS (308 Permanent Redirect)
curl -I http://votre-domaine.com
# Réponse attendue :
# HTTP/1.1 308 Permanent Redirect
# Location: https://votre-domaine.com/
```

### 4. Vérifier dans le navigateur

1. Ouvrir `https://votre-domaine.com` dans votre navigateur
2. Cliquer sur le cadenas dans la barre d'adresse
3. Vérifier que le certificat est valide et émis par "Let's Encrypt"

---

## 🔄 Retour en arrière (HTTP uniquement)

Si vous devez revenir en HTTP (par exemple pour tests locaux), suivez ces étapes :

### 1. Commenter les lignes HTTPS dans Traefik

```yaml
traefik:
  command:
    - "--entrypoints.web.address=:80"
    # - "--entrypoints.websecure.address=:443"  # ✅ COMMENTER
    # - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"  # ✅ COMMENTER
    # - "--certificatesresolvers.letsencrypt.acme.email=..."  # ✅ COMMENTER
    # - "--certificatesresolvers.letsencrypt.acme.storage=..."  # ✅ COMMENTER
    # - "--entrypoints.web.http.redirections.entrypoint.to=websecure"  # ✅ COMMENTER
    # - "--entrypoints.web.http.redirections.entrypoint.scheme=https"  # ✅ COMMENTER
```

### 2. Retirer le port 443 et le volume letsencrypt

```yaml
ports:
  - "80:80"
  # - "443:443"  # ✅ COMMENTER
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
  # - letsencrypt:/letsencrypt  # ✅ COMMENTER
```

### 3. Retirer les labels TLS des services

Pour chaque service, retirer :
- `websecure` des `entrypoints` (garder uniquement `web`)
- Les labels `tls=true` et `tls.certresolver=letsencrypt`
- Le `Host()` des règles (garder uniquement `PathPrefix()`)

### 4. Mettre à jour `.env.prod`

Remettre les URLs en HTTP :
```bash
DM_ALLOWED_ORIGINS=http://localhost,http://127.0.0.1
DM_HEDGEDOC_PUBLIC_URL=http://localhost/hedgedoc
```

### 5. Désactiver HSTS dans Nginx

```nginx
# add_header Strict-Transport-Security "..." always;  # ✅ COMMENTER
```

---

## 📝 Checklist de migration

### Avant la migration
- [ ] Domaine configuré et pointant vers le serveur
- [ ] DNS vérifié (`dig votre-domaine.com`)
- [ ] Ports 80 et 443 ouverts dans le firewall
- [ ] Backup de `docker-compose.prod.yml` et `.env.prod`

### Pendant la migration
- [ ] Traefik configuré avec Let's Encrypt
- [ ] Volume `letsencrypt` ajouté
- [ ] Labels TLS ajoutés sur tous les services
- [ ] `.env.prod` mis à jour avec URLs HTTPS
- [ ] HSTS activé dans Nginx
- [ ] CSP mis à jour dans Nginx

### Après la migration
- [ ] Certificat généré (vérifier logs Traefik)
- [ ] HTTPS fonctionne (`curl -I https://votre-domaine.com`)
- [ ] Redirection HTTP → HTTPS fonctionne
- [ ] Certificat valide dans le navigateur
- [ ] Tous les services accessibles en HTTPS

---

## 🐛 Troubleshooting

### Problème : Certificat non généré

**Symptômes** : Erreur dans les logs Traefik

**Solutions** :
1. Vérifier que le domaine pointe vers le serveur : `dig votre-domaine.com`
2. Vérifier que les ports 80 et 443 sont ouverts
3. Vérifier les logs : `docker-compose -f docker-compose.prod.yml logs traefik`
4. Vérifier que l'email est valide dans la config

### Problème : Rate limit Let's Encrypt

**Symptômes** : Erreur "too many certificates"

**Solutions** :
1. Utiliser le staging endpoint pour les tests :
   ```yaml
   - "--certificatesresolvers.letsencrypt.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory"
   ```
2. Attendre quelques heures
3. Utiliser un autre domaine pour les tests

### Problème : Redirection en boucle

**Symptômes** : Erreur "too many redirects"

**Solutions** :
1. Vérifier que les labels `entrypoints` incluent `web,websecure`
2. Vérifier que la redirection HTTP → HTTPS est correctement configurée
3. Vérifier que Nginx n'a pas de redirection supplémentaire

### Problème : Service inaccessible

**Symptômes** : 404 ou erreur de connexion

**Solutions** :
1. Vérifier que le `Host()` dans les labels correspond à votre domaine
2. Vérifier que les services sont démarrés : `docker-compose -f docker-compose.prod.yml ps`
3. Vérifier les logs : `docker-compose -f docker-compose.prod.yml logs <service>`

---

## 📚 Ressources

- [HTTPS_SETUP.md](./HTTPS_SETUP.md) : Guide de configuration HTTPS détaillé
- [PRODUCTION.md](./PRODUCTION.md) : Guide de déploiement production
- [Traefik Let's Encrypt Documentation](https://doc.traefik.io/traefik/https/acme/)

---

## 💡 Notes importantes

1. **Premier démarrage** : La génération du certificat peut prendre 1-2 minutes
2. **Renouvellement automatique** : Traefik renouvelle automatiquement les certificats (valides 90 jours)
3. **Domaine requis** : Let's Encrypt nécessite un domaine valide. Pour tests locaux, utilisez ngrok ou un certificat auto-signé
4. **Email** : L'email configuré recevra des notifications de renouvellement

---

**Version** : 1.0  
**Dernière mise à jour** : 2025-01-11

