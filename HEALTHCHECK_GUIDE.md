# Guide Healthcheck Détaillé - dataMortem

**Date** : 2025-01-11  
**Statut** : ✅ Implémenté

---

## 📋 Vue d'ensemble

Le système de healthcheck a été amélioré avec des endpoints détaillés qui fournissent des métriques complètes sur tous les services critiques.

---

## 🔗 Endpoints Disponibles

### 1. `/api/health` (Public)
**Description** : Healthcheck simple et public  
**Authentification** : Aucune  
**Usage** : Monitoring basique, load balancer health checks

**Réponse** :
```json
{
  "status": "healthy",
  "service": "datamortem-api",
  "message": "API is running"
}
```

---

### 2. `/api/health/status` (Authentifié)
**Description** : Statut simple de tous les services  
**Authentification** : Requise  
**Usage** : Vue d'ensemble rapide

**Réponse** :
```json
{
  "api": {"status": "healthy", "message": "Running"},
  "postgres": {"status": "healthy", "message": "Connected"},
  "redis": {"status": "healthy", "message": "Connected"},
  "celery": {"status": "healthy", "message": "1 worker(s) active"},
  "opensearch": {"status": "healthy", "message": "Cluster: green"}
}
```

---

### 3. `/api/health/detailed` (Authentifié) ⭐ NOUVEAU
**Description** : Healthcheck détaillé avec métriques complètes  
**Authentification** : Requise  
**Usage** : Monitoring approfondi, diagnostic, dashboard

**Réponse** :
```json
{
  "overall_status": "healthy",
  "timestamp": 1705012345.678,
  "environment": "production",
  "services": {
    "postgres": {
      "status": "healthy",
      "connected": true,
      "version": "16.1",
      "database_size_mb": 245.67,
      "active_connections": 5,
      "max_connections": 100,
      "connection_usage_percent": 5.0,
      "response_time_ms": 12.34,
      "error": null
    },
    "redis": {
      "status": "healthy",
      "connected": true,
      "version": "7.2.0",
      "used_memory_mb": 45.23,
      "used_memory_peak_mb": 52.11,
      "max_memory_mb": 512.0,
      "memory_usage_percent": 8.83,
      "connected_clients": 3,
      "total_keys": 1234,
      "response_time_ms": 2.45,
      "error": null
    },
    "opensearch": {
      "status": "healthy",
      "connected": true,
      "cluster_name": "docker-cluster",
      "cluster_status": "green",
      "version": "2.17.0",
      "number_of_nodes": 1,
      "number_of_data_nodes": 1,
      "active_primary_shards": 5,
      "active_shards": 5,
      "relocating_shards": 0,
      "initializing_shards": 0,
      "unassigned_shards": 0,
      "total_indices": 3,
      "total_documents": 12345,
      "total_size_mb": 156.78,
      "response_time_ms": 45.67,
      "error": null
    },
    "celery": {
      "status": "healthy",
      "eager_mode": false,
      "workers_active": 1,
      "workers_registered": ["celery@worker-1"],
      "total_tasks_processed": 5432,
      "active_tasks": 2,
      "reserved_tasks": 0,
      "scheduled_tasks": 1,
      "response_time_ms": 23.45,
      "error": null
    },
    "disk": {
      "status": "healthy",
      "path": "/lake",
      "total_gb": 500.0,
      "used_gb": 125.5,
      "free_gb": 374.5,
      "usage_percent": 25.1,
      "error": null
    },
    "rate_limiting": {
      "status": "healthy",
      "enabled": true,
      "redis_available": true,
      "backend": "Redis",
      "error": null
    },
    "hedgedoc": {
      "status": "healthy",
      "enabled": true,
      "base_url": "http://hedgedoc:3000",
      "public_url": "https://yourdomain.com/hedgedoc",
      "reachable": true,
      "response_time_ms": 15.23,
      "error": null
    }
  }
}
```

---

### 4. `/api/health/ready` (Public) ⭐ NOUVEAU
**Description** : Kubernetes readiness probe  
**Authentification** : Aucune  
**Usage** : Kubernetes/Orchestration readiness checks

**Réponse** :
- **200 OK** : Service prêt (PostgreSQL et Redis OK)
- **503 Service Unavailable** : Service non prêt

```json
{
  "status": "ready"
}
```

---

### 5. `/api/health/live` (Public) ⭐ NOUVEAU
**Description** : Kubernetes liveness probe  
**Authentification** : Aucune  
**Usage** : Kubernetes/Orchestration liveness checks

**Réponse** :
```json
{
  "status": "alive"
}
```

---

## 📊 Métriques Collectées

### PostgreSQL
- ✅ Connexion
- ✅ Version
- ✅ Taille de la base de données (MB)
- ✅ Connexions actives / max
- ✅ Pourcentage d'utilisation du pool
- ✅ Temps de réponse

### Redis
- ✅ Connexion
- ✅ Version
- ✅ Mémoire utilisée / max (MB)
- ✅ Pourcentage d'utilisation mémoire
- ✅ Clients connectés
- ✅ Nombre total de clés
- ✅ Temps de réponse

### OpenSearch
- ✅ Connexion
- ✅ Nom du cluster
- ✅ Statut du cluster (green/yellow/red)
- ✅ Version
- ✅ Nombre de nœuds
- ✅ Shards (actifs, en relocalisation, non assignés)
- ✅ Nombre total d'indices
- ✅ Nombre total de documents
- ✅ Taille totale (MB)
- ✅ Temps de réponse

### Celery
- ✅ Mode eager (dev)
- ✅ Nombre de workers actifs
- ✅ Liste des workers
- ✅ Tâches traitées (total)
- ✅ Tâches actives
- ✅ Tâches réservées
- ✅ Tâches planifiées
- ✅ Temps de réponse

### Disk Space
- ✅ Chemin de stockage
- ✅ Espace total / utilisé / libre (GB)
- ✅ Pourcentage d'utilisation
- ✅ Statut basé sur l'utilisation :
  - `healthy` : < 80%
  - `degraded` : 80-90%
  - `unhealthy` : > 90%

### Rate Limiting
- ✅ Activé / désactivé
- ✅ Backend (Redis / In-memory)
- ✅ Disponibilité Redis
- ✅ Statut

### HedgeDoc
- ✅ Activé / désactivé
- ✅ URLs configurées
- ✅ Accessibilité
- ✅ Temps de réponse

---

## 🎯 Statuts Possibles

- **`healthy`** : Service opérationnel
- **`degraded`** : Service fonctionnel mais avec limitations
- **`unhealthy`** : Service non opérationnel
- **`disabled`** : Service désactivé (HedgeDoc)
- **`unknown`** : Statut indéterminé

---

## 🔧 Utilisation

### Monitoring Simple
```bash
# Healthcheck public
curl http://localhost:8000/api/health

# Statut simple (authentifié)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/health/status
```

### Monitoring Détaillé
```bash
# Healthcheck détaillé (authentifié)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/health/detailed | jq
```

### Kubernetes Probes
```yaml
# Dans votre deployment Kubernetes
livenessProbe:
  httpGet:
    path: /api/health/live
    port: 8000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /api/health/ready
    port: 8000
  initialDelaySeconds: 5
  periodSeconds: 5
```

### Docker Healthcheck
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8000/api/health/ready || exit 1
```

### Monitoring avec Prometheus
Le endpoint `/api/health/detailed` peut être utilisé pour exporter des métriques vers Prometheus via un exporter personnalisé.

---

## ⚠️ Notes Importantes

1. **Performance** : Le healthcheck détaillé peut prendre 100-500ms selon les services. Utiliser `/api/health` pour des checks fréquents.

2. **Authentification** : Les endpoints `/detailed` et `/status` nécessitent une authentification. Les endpoints `/ready` et `/live` sont publics pour Kubernetes.

3. **Timeouts** : Tous les checks ont des timeouts (2-30s) pour éviter de bloquer l'API.

4. **Erreurs** : En cas d'erreur, le champ `error` contient le message détaillé.

5. **Disk Space** : Le check d'espace disque utilise `shutil.disk_usage()` qui vérifie l'espace du système de fichiers, pas seulement le volume monté.

---

## 📈 Exemples d'Utilisation

### Script de Monitoring
```bash
#!/bin/bash
TOKEN="your_jwt_token"
API_URL="http://localhost:8000"

# Récupérer le statut détaillé
response=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_URL/api/health/detailed")

# Extraire le statut global
overall=$(echo $response | jq -r '.overall_status')

if [ "$overall" != "healthy" ]; then
  echo "⚠️  System status: $overall"
  echo "$response" | jq '.services | to_entries | map(select(.value.status != "healthy"))'
else
  echo "✅ All systems healthy"
fi
```

### Alerting
```python
import requests

def check_health():
    response = requests.get(
        "http://localhost:8000/api/health/detailed",
        headers={"Authorization": f"Bearer {token}"}
    )
    data = response.json()
    
    if data["overall_status"] != "healthy":
        # Envoyer alerte
        send_alert(f"System unhealthy: {data['overall_status']}")
    
    # Vérifier services critiques
    critical = ["postgres", "redis", "opensearch"]
    for service in critical:
        status = data["services"][service]["status"]
        if status != "healthy":
            send_alert(f"{service} is {status}")
```

---

## 🔄 Améliorations Futures

- [ ] Export Prometheus metrics
- [ ] Historique des métriques
- [ ] Alertes automatiques
- [ ] Dashboard de monitoring
- [ ] Healthcheck pour services externes (SMTP, etc.)

---

**Version** : 1.0  
**Dernière mise à jour** : 2025-01-11

