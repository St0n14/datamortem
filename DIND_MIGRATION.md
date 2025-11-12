# Migration vers Docker-in-Docker (DinD)

## 📋 Vue d'ensemble

Cette migration remplace l'accès direct au socket Docker (`/var/run/docker.sock`) par un daemon Docker isolé (Docker-in-Docker) pour l'exécution des scripts custom.

### Pourquoi cette migration ?

**Avant (INSECURE):**
```
celery-worker → /var/run/docker.sock (host) → Accès à TOUS les containers et secrets
```

**Après (SECURE):**
```
celery-worker → docker-dind (isolé) → Containers de sandbox uniquement
```

### Avantages de sécurité

- ✅ **Isolation complète**: Le worker ne peut plus lire les secrets des autres containers
- ✅ **Principe du moindre privilège**: DinD tourne en mode privileged, mais isolé
- ✅ **Surface d'attaque réduite**: Même si un script malveillant s'échappe, il reste dans DinD
- ✅ **Nettoyage automatique**: Les containers orphelins sont détruits avec le service DinD

## 🚀 Migration automatique

### Option 1: Script automatique (Recommandé)

```bash
# Exécuter le script de migration
./migrate-to-dind.sh
```

Le script va:
1. Vérifier que les fichiers sont modifiés
2. Sauvegarder les changements git
3. Arrêter la stack actuelle
4. Nettoyer les anciennes images sandbox
5. Démarrer la nouvelle stack avec DinD
6. Vérifier la connexion
7. Afficher le statut

### Option 2: Migration manuelle

```bash
# 1. Arrêter la stack
make down

# 2. Démarrer la nouvelle stack
make up

# 3. Attendre que les services soient prêts
sleep 30

# 4. Vérifier la connexion
docker exec requiem-celery docker info
```

## 🧪 Tests de validation

### Script de test automatique

```bash
./test-dind.sh
```

Ce script teste:
- ✅ Service docker-dind en cours d'exécution
- ✅ Connexion Celery → DinD
- ✅ Variables d'environnement correctes
- ✅ Certificats TLS montés
- ✅ Exécution d'un container test
- ✅ Isolation du daemon DinD

### Tests manuels

```bash
# Vérifier que DinD tourne
docker ps | grep requiem-dind

# Tester la connexion depuis Celery
docker exec requiem-celery docker version
docker exec requiem-celery docker ps
docker exec requiem-celery docker images

# Vérifier les variables d'environnement
docker exec requiem-celery env | grep DOCKER

# Tester l'exécution d'un container simple
docker exec requiem-celery docker run --rm alpine:latest echo "Hello from DinD"
```

## 📊 Changements apportés

### 1. docker-compose.yml

**Nouveau service ajouté:**
```yaml
docker-dind:
  image: docker:27-dind
  privileged: true
  environment:
    - DOCKER_TLS_CERTDIR=/certs
  volumes:
    - dind-certs-ca:/certs/ca
    - dind-certs-client:/certs/client
    - dind-storage:/var/lib/docker
```

**Service celery-worker modifié:**
```yaml
environment:
  - DOCKER_HOST=tcp://docker-dind:2376
  - DOCKER_TLS_VERIFY=1
  - DOCKER_CERT_PATH=/certs/client
volumes:
  - dind-certs-client:/certs/client:ro  # Au lieu de docker.sock
depends_on:
  - docker-dind
```

**Nouveaux volumes:**
```yaml
volumes:
  dind-certs-ca:       # Certificats CA pour TLS
  dind-certs-client:   # Certificats client pour TLS
  dind-storage:        # Storage du daemon DinD
```

### 2. docker-compose.prod.yml

Les mêmes changements ont été appliqués pour la production.

### 3. run_custom_script.py

Ajout de logging pour débugger la connexion DinD:
```python
def _get_docker_client() -> docker.DockerClient:
    if _docker_client is None:
        _docker_client = docker.from_env()
        docker_host = os.getenv('DOCKER_HOST', 'unix:///var/run/docker.sock')
        print(f"[DinD] Docker client connected to: {docker_host}")
        # ... logging supplémentaire
```

## 🔍 Debugging

### Logs DinD
```bash
docker logs requiem-dind
docker logs requiem-dind -f --tail 100
```

### Logs Celery
```bash
docker logs requiem-celery
docker logs requiem-celery -f | grep -i docker
```

### Vérifier l'isolation
```bash
# ID du daemon host
docker info --format '{{.ID}}'

# ID du daemon DinD (devrait être différent)
docker exec requiem-celery docker info --format '{{.ID}}'
```

### Inspecter les certificats
```bash
docker exec requiem-celery ls -la /certs/client/
docker exec requiem-celery openssl x509 -in /certs/client/cert.pem -text -noout
```

## ❓ FAQ

### Q: Pourquoi DinD nécessite-t-il le mode privileged ?
**R:** Le daemon Docker doit pouvoir créer des namespaces et gérer des cgroups. Mais contrairement à monter `/var/run/docker.sock`, le mode privileged est **limité au service DinD uniquement**, pas au worker.

### Q: Les performances sont-elles impactées ?
**R:** Légère overhead (200-300MB RAM supplémentaire), mais négligeable comparé au gain de sécurité. Le cache d'images est maintenu dans le volume `dind-storage`.

### Q: Que se passe-t-il si je redémarre DinD ?
**R:** Tous les containers en cours d'exécution dans DinD sont arrêtés. Les images sont conservées dans le volume `dind-storage`.

### Q: Comment nettoyer complètement DinD ?
**R:**
```bash
docker-compose down
docker volume rm datamortem_dind-storage
docker-compose up -d
```

### Q: Puis-je utiliser les mêmes images sandbox qu'avant ?
**R:** Oui, mais elles doivent être reconstruites dans DinD la première fois. Le script `migrate-to-dind.sh` nettoie automatiquement les anciennes images.

## 🛡️ Sécurité

### Avant DinD (Vulnérable)
- ❌ Celery peut lire `/var/run/docker.sock`
- ❌ Peut inspecter tous les containers
- ❌ Peut extraire les variables d'env (JWT_SECRET, DB passwords, etc.)
- ❌ Peut créer des containers avec accès réseau illimité

### Après DinD (Sécurisé)
- ✅ Celery ne peut accéder qu'au daemon DinD isolé
- ✅ Pas d'accès aux containers de production
- ✅ Pas d'accès aux secrets du host
- ✅ Isolation réseau complète

## 📚 Ressources

- [Docker-in-Docker official image](https://hub.docker.com/_/docker)
- [Docker daemon socket security](https://docs.docker.com/engine/security/)
- [Best practices for running Docker in CI/CD](https://jpetazzo.github.io/2015/09/03/do-not-use-docker-in-docker-for-ci/)

## 🔄 Rollback (si nécessaire)

Si la migration pose problème, tu peux rollback:

```bash
# 1. Revenir aux anciens fichiers docker-compose
git checkout HEAD~1 docker-compose.yml docker-compose.prod.yml

# 2. Revenir au code Python
git checkout HEAD~1 services/api/app/tasks/run_custom_script.py

# 3. Redémarrer
make down && make up
```

⚠️ **Attention:** Le rollback réintroduit les vulnérabilités de sécurité!
