# Checklist Sécurité & Production - Requiem

**Version** : 1.0  
**Date** : 2025-01-11  
**État actuel** : ~60-65% production-ready

Ce document liste toutes les étapes nécessaires pour rendre Requiem **sécurisé et prêt pour la production**.

---

## 📋 Vue d'ensemble

### Priorités
1. **🔴 CRITIQUE** : Sécurité de base (secrets, HTTPS, rate limiting)
2. **🟠 IMPORTANT** : Monitoring, backups, tests
3. **🟡 RECOMMANDÉ** : Optimisations, documentation

### Score actuel par catégorie
- **Sécurité** : 70% ✅
- **Infrastructure** : 50% ⚠️
- **Monitoring** : 0% ❌
- **Backups** : 0% ❌
- **Tests** : 10% ⚠️
- **Documentation** : 60% ✅

---

## 🔴 PHASE 1 : Sécurité Critique (À faire IMMÉDIATEMENT)

### 1.1 Configuration des secrets et variables d'environnement

#### ✅ Créer `.env.prod.example`
```bash
# Template pour production
DM_ENV=production
DM_DB_URL=postgresql://requiem:CHANGE_ME@postgres:5432/requiem
DM_CELERY_BROKER=redis://redis:6379/0
DM_CELERY_BACKEND=redis://redis:6379/1

# JWT Secret (MINIMUM 32 caractères, générer avec: openssl rand -base64 48)
DM_JWT_SECRET=CHANGE_ME_GENERATE_RANDOM_SECRET_MIN_32_CHARS

# PostgreSQL
DM_POSTGRES_PASSWORD=CHANGE_ME_GENERATE_RANDOM_PASSWORD

# HedgeDoc
DM_HEDGEDOC_DB_PASSWORD=CHANGE_ME_GENERATE_RANDOM_PASSWORD
DM_HEDGEDOC_ENABLED=true
DM_HEDGEDOC_BASE_URL=http://hedgedoc:3000
DM_HEDGEDOC_PUBLIC_URL=https://yourdomain.com/hedgedoc

# OpenSearch (si authentification activée)
DM_OPENSEARCH_USER=admin
DM_OPENSEARCH_PASSWORD=CHANGE_ME

# CORS - RESTREINDRE AU DOMAINE PRODUCTION
DM_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Email (si activé)
DM_ENABLE_EMAIL_VERIFICATION=true
DM_SMTP_HOST=smtp.example.com
DM_SMTP_PORT=587
DM_SMTP_USERNAME=your_smtp_user
DM_SMTP_PASSWORD=CHANGE_ME
DM_EMAIL_SENDER=noreply@yourdomain.com
DM_EMAIL_VERIFICATION_BASE_URL=https://yourdomain.com/verify-email

# OTP/2FA
DM_ENABLE_OTP=true
DM_OTP_ISSUER=Requiem
```

#### ✅ Générer les secrets
```bash
# Créer .env.prod depuis le template
cp .env.prod.example .env.prod

# Générer les secrets
DM_JWT_SECRET=$(openssl rand -base64 48)
DM_POSTGRES_PASSWORD=$(openssl rand -base64 32)
DM_HEDGEDOC_DB_PASSWORD=$(openssl rand -base64 32)
DM_OPENSEARCH_PASSWORD=$(openssl rand -base64 32)

# Éditer .env.prod et remplacer CHANGE_ME
nano .env.prod
```

**Action** : Créer `.env.prod.example` et documenter la génération des secrets

---

### 1.2 Implémenter Rate Limiting

**Problème actuel** : Aucun rate limiting sur les endpoints publics (risque de DoS/brute force)

**Solution** : Ajouter `slowapi` ou middleware FastAPI avec Redis

#### Étapes :
1. Ajouter `slowapi` au `pyproject.toml`
2. Créer middleware de rate limiting
3. Appliquer sur endpoints critiques :
   - `/api/auth/login` : 5 tentatives/minute
   - `/api/auth/register` : 3 tentatives/heure
   - `/api/*` : 100 requêtes/minute par IP
   - `/api/search` : 30 requêtes/minute

**Action** : Implémenter rate limiting avec Redis backend

---

### 1.3 Configurer HTTPS/TLS

**Problème actuel** : Traefik configuré en HTTP uniquement

#### Étapes :
1. Configurer Let's Encrypt dans `docker-compose.prod.yml`
2. Ajouter entrypoint HTTPS (port 443)
3. Rediriger HTTP → HTTPS
4. Configurer certificats pour tous les services

**Action** : Mettre à jour Traefik avec Let's Encrypt

---

### 1.4 Sécuriser Traefik Dashboard

**Problème actuel** : Dashboard accessible sans authentification (`--api.insecure=true`)

#### Étapes :
1. Désactiver `--api.insecure`
2. Protéger le dashboard avec Basic Auth ou OAuth
3. Restreindre l'accès par IP (optionnel)

**Action** : Sécuriser le dashboard Traefik

---

### 1.5 Headers de sécurité complets

**Problème actuel** : Nginx manque CSP (Content Security Policy) et autres headers

#### À ajouter dans `nginx.conf` :
```nginx
# Content Security Policy
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://yourdomain.com/api;" always;

# Strict Transport Security (HTTPS uniquement)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

# Permissions Policy
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

**Action** : Compléter les headers de sécurité dans Nginx

---

### 1.6 Restreindre CORS

**Problème actuel** : CORS trop permissif en production

#### Vérifier dans `config.py` :
- `DM_ALLOWED_ORIGINS` doit être restreint au domaine production
- Ne pas utiliser `allow_credentials=True` sauf si nécessaire
- Limiter les méthodes HTTP autorisées

**Action** : Vérifier et restreindre CORS pour production

---

## 🟠 PHASE 2 : Infrastructure & Monitoring

### 2.1 Healthchecks complets

**État actuel** : Healthchecks basiques présents

#### À améliorer :
1. Healthcheck API qui vérifie :
   - Connexion PostgreSQL
   - Connexion Redis
   - Connexion OpenSearch
   - Espace disque disponible
2. Endpoint `/api/health/detailed` avec métriques

**Action** : Implémenter healthcheck détaillé

---

### 2.2 Monitoring & Alerting

**Problème actuel** : Aucun monitoring

#### Options recommandées :
1. **Prometheus + Grafana** (métriques)
2. **Sentry** (erreurs applicatives)
3. **ELK/Loki** (logs centralisés)

#### Métriques à surveiller :
- CPU/Mémoire par service
- Latence API (p50, p95, p99)
- Taux d'erreur HTTP
- Taille base de données
- Espace disque
- Nombre de requêtes/minute
- Taux d'échec Celery tasks

**Action** : Configurer monitoring de base (Prometheus + Grafana)

---

### 2.3 Logging structuré

**Problème actuel** : Logs non structurés

#### À implémenter :
1. Format JSON pour logs
2. Niveaux de log appropriés (INFO, WARNING, ERROR)
3. Correlation IDs pour tracer les requêtes
4. Rotation des logs

**Action** : Structurer les logs (JSON format)

---

### 2.4 Backups automatiques

**Problème actuel** : Pas de backup automatique

#### À configurer :
1. **PostgreSQL** : Backup quotidien (pg_dump)
2. **Volumes Docker** : Backup hebdomadaire
3. **OpenSearch** : Snapshot automatique
4. **Retention** : 30 jours de backups

#### Scripts à créer :
- `scripts/backup-db.sh` : Backup PostgreSQL
- `scripts/backup-volumes.sh` : Backup volumes
- `scripts/restore-db.sh` : Restore depuis backup
- Cron job ou tâche Celery périodique

**Action** : Implémenter backups automatiques

---

### 2.5 Firewall & Network Security

#### À configurer :
1. **Firewall** : Ouvrir uniquement ports 80/443
2. **Docker networks** : Isoler les services
3. **Secrets management** : Utiliser Docker secrets ou Vault
4. **Network policies** : Restreindre communication inter-services

**Action** : Configurer firewall et isolation réseau

---

## 🟡 PHASE 3 : Tests & Qualité

### 3.1 Tests de sécurité

#### À implémenter :
1. **OWASP ZAP** ou **Burp Suite** : Scan de vulnérabilités
2. **Bandit** (Python) : Analyse statique de code
3. **npm audit** (Frontend) : Vulnérabilités dépendances
4. **Trivy** : Scan images Docker

**Action** : Ajouter tests de sécurité automatisés

---

### 3.2 Tests d'intégration

**Problème actuel** : Tests limités (10%)

#### À créer :
1. Tests end-to-end des workflows critiques
2. Tests de charge (k6, locust)
3. Tests de régression
4. Tests de migration Alembic

**Action** : Augmenter couverture de tests à 60%+

---

### 3.3 CI/CD Pipeline

**Problème actuel** : Pas de CI/CD

#### À configurer :
1. **GitHub Actions** ou **GitLab CI**
2. Pipeline :
   - Lint & format
   - Tests unitaires
   - Tests de sécurité
   - Build images Docker
   - Déploiement staging
   - Déploiement production (manuel)

**Action** : Configurer CI/CD de base

---

## 📝 PHASE 4 : Documentation & Opérations

### 4.1 Documentation opérationnelle

#### À créer/compléter :
1. **RUNBOOK.md** : Procédures opérationnelles
2. **INCIDENT_RESPONSE.md** : Gestion d'incidents
3. **DISASTER_RECOVERY.md** : Plan de reprise
4. **SECURITY_POLICY.md** : Politique de sécurité

**Action** : Créer documentation opérationnelle

---

### 4.2 Scripts d'administration

#### À créer :
1. `scripts/health-check.sh` : Vérification complète
2. `scripts/rotate-logs.sh` : Rotation des logs
3. `scripts/cleanup-old-backups.sh` : Nettoyage backups
4. `scripts/update-stack.sh` : Mise à jour sécurisée

**Action** : Créer scripts d'administration

---

## ✅ Checklist finale avant mise en production

### Sécurité
- [ ] Tous les secrets générés aléatoirement (JWT, DB passwords)
- [ ] HTTPS/TLS configuré avec Let's Encrypt
- [ ] Rate limiting implémenté sur endpoints publics
- [ ] CORS restreint au domaine production
- [ ] Headers de sécurité complets (CSP, HSTS, etc.)
- [ ] Traefik dashboard sécurisé
- [ ] Firewall configuré (ports 80/443 uniquement)
- [ ] Secrets management (Docker secrets ou Vault)

### Infrastructure
- [ ] Healthchecks complets et fonctionnels
- [ ] Monitoring configuré (Prometheus/Grafana)
- [ ] Logging structuré (JSON)
- [ ] Backups automatiques configurés
- [ ] Restart policies configurées (`unless-stopped`)
- [ ] Resource limits configurés (CPU/Memory)

### Tests
- [ ] Tests de sécurité passés (OWASP ZAP, Bandit)
- [ ] Tests d'intégration passés
- [ ] Tests de charge effectués
- [ ] Scan de vulnérabilités Docker (Trivy)

### Documentation
- [ ] Documentation déploiement complète
- [ ] Runbook opérationnel
- [ ] Plan de reprise (disaster recovery)
- [ ] Procédures d'incident

### Opérations
- [ ] Scripts d'administration créés
- [ ] Procédures de mise à jour documentées
- [ ] Alertes configurées (Sentry, monitoring)
- [ ] Accès SSH/console sécurisé

---

## 🚀 Ordre d'exécution recommandé

### Semaine 1 : Sécurité Critique
1. ✅ Créer `.env.prod.example` et générer secrets
2. ✅ Implémenter rate limiting
3. ✅ Configurer HTTPS/TLS
4. ✅ Sécuriser Traefik dashboard
5. ✅ Compléter headers de sécurité

### Semaine 2 : Infrastructure
1. ✅ Healthchecks détaillés
2. ✅ Monitoring de base (Prometheus)
3. ✅ Logging structuré
4. ✅ Backups automatiques

### Semaine 3 : Tests & Qualité
1. ✅ Tests de sécurité
2. ✅ Tests d'intégration
3. ✅ CI/CD pipeline
4. ✅ Tests de charge

### Semaine 4 : Documentation & Finalisation
1. ✅ Documentation opérationnelle
2. ✅ Scripts d'administration
3. ✅ Review sécurité complète
4. ✅ Tests finaux avant production

---

## 📊 Métriques de succès

### Objectifs
- **Sécurité** : 90%+ (actuellement 70%)
- **Infrastructure** : 80%+ (actuellement 50%)
- **Monitoring** : 80%+ (actuellement 0%)
- **Tests** : 60%+ (actuellement 10%)
- **Documentation** : 90%+ (actuellement 60%)

### KPIs Production
- Uptime : 99.9%
- Latence API p95 : < 200ms
- Taux d'erreur : < 0.1%
- Temps de récupération (RTO) : < 1h
- Point de récupération (RPO) : < 24h

---

## 🔗 Ressources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [FastAPI Security Best Practices](https://fastapi.tiangolo.com/advanced/security/)
- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Nginx Security Headers](https://www.nginx.com/blog/security-headers-nginx/)

---

**Note** : Ce document doit être mis à jour régulièrement au fur et à mesure de l'avancement des tâches.

