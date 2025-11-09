# Load tests (local)

Ces scénarios K6 permettent de valider que Traefik + plusieurs API répondent correctement avant d’industrialiser.

## Prérequis

- [k6](https://k6.io/docs/getting-started/installation/) installé en local
- Stack dataMortem démarrée via `./start-stack.sh` (Traefik écoute sur `http://localhost:8080`)
- Facultatif : augmenter le nombre de réplicas API `docker-compose up -d --scale api=2`

## Scripts disponibles

| Script | Objectif |
| --- | --- |
| `health-smoke.js` | Martèle `GET /health` avec un nombre fixe de VUs pour s’assurer que le LB distribue bien la charge. |
| `search-health-throughput.js` | Test “ramping arrival rate” sur `GET /api/search/health` pour simuler une montée progressive. |

## Paramètres communs

Les scripts acceptent des variables d’environnement :

- `API_BASE_URL` (défaut `http://localhost:8080`)
- `VUS`, `DURATION`, `SLEEP` pour `health-smoke.js`
- `START_RATE`, `MID_RATE`, `PEAK_RATE`, `VUS`, `MAX_VUS` pour `search-health-throughput.js`

## Exécution

```bash
# Test fumée (25 VUs pendant 2 minutes)
k6 run load-tests/health-smoke.js

# Exemple avec overrides
API_BASE_URL=http://localhost:8080 \
VUS=50 \
DURATION=5m \
k6 run load-tests/health-smoke.js

# Test montée en charge sur /api/search/health
API_BASE_URL=http://localhost:8080 \
START_RATE=10 MID_RATE=40 PEAK_RATE=100 \
VUS=40 MAX_VUS=250 \
k6 run load-tests/search-health-throughput.js
```

## Exploitation

- Surveiller `docker logs datamortem-traefik` et `datamortem-api` pour vérifier le round-robin.
- Ajuster `docker-compose up -d --scale api=<n>` pour voir comment la stack encaisse la montée en charge.
- Les métriques k6 (`http_req_duration`, `http_req_failed`, tendances custom) permettent de comparer avant/après optimisation.
