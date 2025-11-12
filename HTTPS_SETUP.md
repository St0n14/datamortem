# Configuration HTTPS/TLS - Requiem

**Date** : 2025-01-11  
**Statut** : ✅ Configuration HTTPS/TLS avec Let's Encrypt complétée

---

## ✅ Ce qui a été fait

1. ✅ **Traefik HTTPS** : Entrypoint 443 configuré
2. ✅ **Let's Encrypt** : Configuration ACME TLS Challenge
3. ✅ **Redirection HTTP → HTTPS** : Automatique
4. ✅ **Labels TLS** : Ajoutés sur tous les services (frontend, api, hedgedoc, opensearch, dashboards)
5. ✅ **Volume letsencrypt** : Ajouté pour stocker les certificats
6. ✅ **HSTS** : Activé dans Nginx

---

## ⚠️ Actions requises AVANT démarrage

### 1. Remplacer `yourdomain.com` par votre domaine

Dans `docker-compose.prod.yml`, remplacer **TOUS** les `yourdomain.com` par votre vrai domaine :

**Fichier** : `docker-compose.prod.yml`

**Lignes à modifier** :
- Ligne 12 : `admin@yourdomain.com` → `admin@votre-domaine.com`
- Ligne 96 : `Host(\`yourdomain.com\`)` → `Host(\`votre-domaine.com\`)`
- Ligne 119 : `Host(\`yourdomain.com\`)` → `Host(\`votre-domaine.com\`)`
- Ligne 164 : `Host(\`yourdomain.com\`)` → `Host(\`votre-domaine.com\`)`
- Ligne 215 : `Host(\`yourdomain.com\`)` → `Host(\`votre-domaine.com\`)`
- Ligne 267 : `Host(\`yourdomain.com\`)` → `Host(\`votre-domaine.com\`)`

**Exemple** :
```yaml
# Avant
- "--certificatesresolvers.letsencrypt.acme.email=admin@yourdomain.com"
- "traefik.http.routers.frontend.rule=Host(`yourdomain.com`)"

# Après
- "--certificatesresolvers.letsencrypt.acme.email=admin@requiem.example.com"
- "traefik.http.routers.frontend.rule=Host(`requiem.example.com`)"
```

---

### 2. Mettre à jour `.env.prod`

Dans votre fichier `.env.prod`, mettre à jour les URLs pour utiliser HTTPS :

```bash
# CORS - Utiliser votre domaine HTTPS
DM_ALLOWED_ORIGINS=https://votre-domaine.com,https://www.votre-domaine.com

# HedgeDoc public URL
DM_HEDGEDOC_PUBLIC_URL=https://votre-domaine.com/hedgedoc

# Email verification
DM_EMAIL_VERIFICATION_BASE_URL=https://votre-domaine.com/verify-email
```

---

### 3. Vérifier le DNS

Assurez-vous que votre domaine pointe vers votre serveur :

```bash
# Vérifier le DNS
dig votre-domaine.com
# ou
nslookup votre-domaine.com

# Doit retourner l'IP de votre serveur
```

---

### 4. Vérifier le firewall

Les ports 80 et 443 doivent être ouverts :

```bash
# Vérifier les ports ouverts
sudo ufw status
# ou
sudo iptables -L -n | grep -E '80|443'

# Ouvrir les ports si nécessaire
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

## 🚀 Démarrage

### 1. Redémarrer la stack

```bash
# Arrêter la stack actuelle
docker-compose -f docker-compose.prod.yml down

# Redémarrer avec HTTPS
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Vérifier les logs Traefik pour voir la génération du certificat
docker-compose -f docker-compose.prod.yml logs -f traefik
```

### 2. Vérifier la génération du certificat

Dans les logs Traefik, vous devriez voir :
```
time="..." level=info msg="Certificate obtained from ACME" resolverName=letsencrypt
time="..." level=info msg="Adding route for ..." entryPointName=websecure
```

---

## ✅ Vérification

### 1. Tester HTTPS

```bash
# Tester depuis votre machine
curl -I https://votre-domaine.com

# Vérifier le certificat
openssl s_client -connect votre-domaine.com:443 -servername votre-domaine.com
```

### 2. Vérifier la redirection HTTP → HTTPS

```bash
# Doit rediriger vers HTTPS (308 Permanent Redirect)
curl -I http://votre-domaine.com
# Réponse attendue :
# HTTP/1.1 308 Permanent Redirect
# Location: https://votre-domaine.com/
```

### 3. Vérifier le certificat dans le navigateur

1. Ouvrir `https://votre-domaine.com` dans votre navigateur
2. Cliquer sur le cadenas dans la barre d'adresse
3. Vérifier que le certificat est valide et émis par "Let's Encrypt"

---

## 🔧 Configuration avancée

### Utiliser Let's Encrypt Staging (pour tests)

Si vous voulez tester sans risquer les rate limits de Let's Encrypt, ajoutez cette ligne dans la section `command` de Traefik :

```yaml
- "--certificatesresolvers.letsencrypt.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory"
```

**⚠️ IMPORTANT** : Retirer cette ligne en production !

### Forcer HTTPS uniquement

La redirection HTTP → HTTPS est déjà configurée. Si vous voulez désactiver complètement HTTP, vous pouvez retirer l'entrypoint `web` des labels, mais ce n'est **pas recommandé** car Let's Encrypt a besoin du port 80 pour la validation.

---

## 🐛 Troubleshooting

### Problème : Certificat non généré

**Symptômes** : Erreur dans les logs Traefik, pas de certificat

**Solutions** :
1. Vérifier que le domaine pointe vers le serveur
2. Vérifier que les ports 80 et 443 sont ouverts
3. Vérifier les logs Traefik : `docker-compose -f docker-compose.prod.yml logs traefik`
4. Vérifier que l'email est valide dans la config

### Problème : Rate limit Let's Encrypt

**Symptômes** : Erreur "too many certificates"

**Solutions** :
1. Utiliser le staging endpoint pour les tests
2. Attendre quelques heures
3. Utiliser un autre domaine pour les tests

### Problème : Redirection en boucle

**Symptômes** : Erreur "too many redirects"

**Solutions** :
1. Vérifier que les labels `entrypoints` incluent `web,websecure`
2. Vérifier que la redirection HTTP → HTTPS est correctement configurée
3. Vérifier que Nginx n'a pas de redirection supplémentaire

---

## 📝 Notes importantes

1. **Renouvellement automatique** : Traefik renouvelle automatiquement les certificats Let's Encrypt (valides 90 jours)

2. **Premier démarrage** : La génération du certificat peut prendre 1-2 minutes lors du premier démarrage

3. **Domaine requis** : Let's Encrypt nécessite un domaine valide. Pour tester en local, utilisez un service comme ngrok ou un certificat auto-signé

4. **Email** : L'email configuré recevra des notifications de renouvellement de Let's Encrypt

---

## 🔗 Ressources

- [Traefik Let's Encrypt Documentation](https://doc.traefik.io/traefik/https/acme/)
- [Let's Encrypt Rate Limits](https://letsencrypt.org/docs/rate-limits/)
- [PRODUCTION.md](./PRODUCTION.md) : Guide de déploiement complet

---

**Version** : 1.0  
**Dernière mise à jour** : 2025-01-11

