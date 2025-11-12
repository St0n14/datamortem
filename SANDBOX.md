# Sandbox Multi-Langages - Requiem

## Vue d'ensemble

Le système de sandbox de Requiem permet l'exécution **isolée et sécurisée** de scripts custom dans différents langages de programmation. Chaque script s'exécute dans un **conteneur Docker dédié** avec des limitations strictes de ressources et d'accès.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI (API Layer)                      │
│                                                             │
│  POST /api/scripts/{id}/run                                │
│         ↓                                                   │
└─────────┼───────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Celery Worker (Orchestration)              │
│                                                             │
│  run_custom_script(script_id, evidence_uid, task_run_id)   │
│         ↓                                                   │
│    1. Build/Pull Docker image (if needed)                  │
│    2. Prepare workspace with source files                  │
│    3. [Optional] Build step (Rust, Go)                     │
│    4. Execute in isolated container                        │
│    5. Capture output & update TaskRun                      │
└─────────┼───────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│           Docker Container (Sandbox Execution)              │
│                                                             │
│  Language-specific image:                                  │
│  • requiem-sandbox-python:3.11                          │
│  • requiem-sandbox-rust:1.75                            │
│  • requiem-sandbox-go:1.21                              │
│                                                             │
│  Security:                                                 │
│  ✓ Non-root user (sandbox:1000)                           │
│  ✓ Read-only filesystem (except /tmp, /output)            │
│  ✓ No network access (--network none)                     │
│  ✓ Memory limit (default 512MB)                           │
│  ✓ CPU limit (default 1 core)                             │
│  ✓ Timeout (default 300s)                                 │
│  ✓ Process limit (100)                                    │
│  ✓ No new privileges                                      │
│  ✓ All Linux capabilities dropped                         │
│                                                             │
│  Volumes:                                                  │
│  • /workspace (ro) → source code                          │
│  • /output (rw) → résultats                               │
│  • /evidence (ro) → artefacts forensiques                 │
└─────────────────────────────────────────────────────────────┘
```

## Langages supportés

### 1. Python

**Versions** : 3.10, 3.11, 3.12

**Image** : `requiem-sandbox-python:{version}`

**Bibliothèques pré-installées** :
- `pandas` 2.2.2 : Manipulation de données
- `pyarrow` 17.0.0 : Format Parquet
- `dissect.target` >=3.20 : Framework forensique

**Format dependencies** : `requirements.txt` standard
```python
requests>=2.28.0
beautifulsoup4==4.12.0
```

**Exemple de script** :
```python
import os
import pandas as pd

case_id = os.getenv("CASE_ID")
evidence_uid = os.getenv("EVIDENCE_UID")
output_dir = os.getenv("OUTPUT_DIR")

# Traitement
df = pd.DataFrame({"event": ["login", "logout"], "timestamp": [1234567890, 1234567900]})
df.to_csv(f"{output_dir}/events.csv", index=False)

print(f"Processed {len(df)} events for case {case_id}")
```

### 2. Rust

**Version** : 1.75 (stable)

**Image** : `requiem-sandbox-rust:1.75`

**Crates pré-cachées** :
- `serde` : Sérialisation
- `serde_json` : JSON
- `csv` : Fichiers CSV
- `chrono` : Dates et heures

**Format dependencies** : Section `[dependencies]` de `Cargo.toml`
```toml
regex = "1.10"
walkdir = "2.4"
```

**Build requis** : Oui
- Commande par défaut : `cargo build --release`
- Entry point par défaut : `./target/release/script`

**Exemple de script** :
```rust
use std::env;
use std::fs::File;
use std::io::Write;

fn main() {
    let case_id = env::var("CASE_ID").unwrap_or_default();
    let output_dir = env::var("OUTPUT_DIR").unwrap_or_default();

    let output_path = format!("{}/events.txt", output_dir);
    let mut file = File::create(output_path).expect("Failed to create output");

    writeln!(file, "Processed case: {}", case_id).unwrap();
    println!("Analysis complete!");
}
```

### 3. Go

**Version** : 1.21+

**Image** : `requiem-sandbox-go:1.21`

**Modules pré-téléchargés** :
- Outils Velocidex (forensique)

**Format dependencies** : `go.mod` ou liste de packages
```go
require (
    github.com/google/uuid v1.6.0
    gopkg.in/yaml.v3 v3.0.1
)
```

**Build requis** : Oui
- Commande par défaut : `go build -o script main.go`
- Entry point par défaut : `./script`

**Exemple de script** :
```go
package main

import (
    "fmt"
    "os"
    "path/filepath"
)

func main() {
    caseID := os.Getenv("CASE_ID")
    outputDir := os.Getenv("OUTPUT_DIR")

    outputPath := filepath.Join(outputDir, "events.txt")
    os.WriteFile(outputPath, []byte(fmt.Sprintf("Case: %s\n", caseID)), 0644)

    fmt.Println("Analysis complete!")
}
```

## Modèle de données

### CustomScript (étendu)

```python
class CustomScript(Base):
    # Identification
    id: int
    name: str  # Unique
    description: str

    # Langage
    language: str  # "python", "rust", "go", "node"
    language_version: str  # "3.11", "1.75", "1.21"

    # Compatibilité (legacy)
    python_version: str  # Déprécié, utiliser language_version

    # Code source
    source_code: str  # Code principal
    additional_files: str  # JSON: {filename: content} pour projets multi-fichiers
    requirements: str  # Dépendances (format selon langage)

    # Build & Exécution
    build_command: str  # Ex: "cargo build --release"
    entry_point: str  # Ex: "./target/release/script", "python script.py"

    # Limites de ressources
    timeout_seconds: int = 300  # 5 minutes par défaut
    memory_limit_mb: int = 512  # 512MB par défaut
    cpu_limit: str  # Ex: "1.5" pour 1.5 cores

    # Métadonnées
    created_at_utc: datetime
    created_by_id: int
    is_approved: bool = False
    published_at: datetime
```

## Workflow d'exécution

### 1. Soumission

```bash
POST /api/scripts/{script_id}/run
{
  "evidence_uid": "evidence_12345"
}
```

**Vérifications** :
- ✅ Script approuvé (`is_approved=True`)
- ✅ Utilisateur a installé le script (`UserScript` entry)
- ✅ Evidence existe et appartient au case de l'utilisateur
- ✅ Langage supporté

### 2. Orchestration (Celery)

```python
run_custom_script.delay(script_id=42, evidence_uid="ev_123", task_run_id=99)
```

**Étapes** :
1. **Validation** : Script, evidence, case existent
2. **Image Docker** : Build ou pull si nécessaire
3. **Workspace** : Création du répertoire avec fichiers source
4. **Build** (si compilé) : Exécution dans container avec accès réseau limité
5. **Exécution** : Container isolé, pas de réseau
6. **Capture** : stdout/stderr → `/output/output.txt`
7. **Mise à jour** : TaskRun status = "success" ou "error"

### 3. Résultats

**Structure** :
```
/lake/{case_id}/{evidence_uid}/scripts/{script_name}_{script_id}/
├── workspace/
│   ├── script.py (ou main.rs, main.go)
│   ├── requirements.txt
│   └── additional_files/
├── output.txt (stdout/stderr)
└── [fichiers générés par le script]
```

**TaskRun** :
- `status` : "queued" → "running" → "success" / "error"
- `output_path` : Chemin vers `output.txt`
- `error_message` : Si échec
- `started_at_utc` / `ended_at_utc` : Timestamps

## Configuration de sécurité

### Restrictions Docker

```bash
docker run \
  --rm \
  --network none \              # Pas d'accès réseau
  --read-only \                 # Filesystem lecture seule
  --tmpfs /tmp:rw,noexec,nosuid,size=100m \  # /tmp writable mais pas exécutable
  --memory 512m \               # Limite mémoire
  --memory-swap 512m \          # Pas de swap
  --pids-limit 100 \            # Max 100 processus
  --ulimit nofile=1024:1024 \   # Max 1024 fichiers ouverts
  --security-opt no-new-privileges \  # Pas d'escalade de privilèges
  --cap-drop ALL \              # Aucune Linux capability
  --cpus 1.0 \                  # 1 CPU core
  --user sandbox:sandbox \      # Non-root (uid=1000)
  -v /workspace:ro \            # Source code (lecture seule)
  -v /output:rw \               # Résultats (écriture)
  -v /evidence:ro \             # Artefacts forensiques (lecture seule)
  requiem-sandbox-python:3.11 \
  python script.py
```

### Limitations

| Ressource | Limite par défaut | Modifiable | Max recommandé |
|-----------|-------------------|------------|----------------|
| Mémoire | 512 MB | ✅ | 4 GB |
| CPU | 1.0 core | ✅ | 4.0 cores |
| Timeout | 300 s (5 min) | ✅ | 3600 s (1h) |
| Processus | 100 | ❌ | 100 |
| Fichiers ouverts | 1024 | ❌ | 1024 |
| Stockage /tmp | 100 MB | ❌ | 100 MB |

### Variables d'environnement injectées

```bash
CASE_ID="case_abc123"           # ID du case
EVIDENCE_UID="ev_xyz789"        # UID de l'evidence
EVIDENCE_PATH="/evidence"       # Montage de l'artefact (si local_path existe)
OUTPUT_DIR="/output"            # Répertoire de sortie
```

## Utilisation

### Via l'API

```python
import requests

# 1. Créer un script
response = requests.post(
    "http://localhost:8080/api/scripts",
    headers={"Authorization": f"Bearer {token}"},
    json={
        "name": "Extract Registry Keys",
        "description": "Parse Windows registry hives",
        "language": "python",
        "language_version": "3.11",
        "source_code": """
import os
from dissect.target import Target

evidence_path = os.getenv("EVIDENCE_PATH")
output_dir = os.getenv("OUTPUT_DIR")

target = Target.open(evidence_path)
# ... parsing logic
        """,
        "requirements": "dissect.target>=3.20",
        "timeout_seconds": 600,
        "memory_limit_mb": 1024,
    }
)
script_id = response.json()["id"]

# 2. Approuver (superadmin uniquement)
requests.post(
    f"http://localhost:8080/api/scripts/{script_id}/approve?approved=true",
    headers={"Authorization": f"Bearer {superadmin_token}"}
)

# 3. Installer (analyst)
requests.post(
    f"http://localhost:8080/api/scripts/{script_id}/install",
    headers={"Authorization": f"Bearer {analyst_token}"}
)

# 4. Exécuter
response = requests.post(
    f"http://localhost:8080/api/scripts/{script_id}/run",
    headers={"Authorization": f"Bearer {analyst_token}"},
    json={"evidence_uid": "ev_12345"}
)
task_run_id = response.json()["task_run_id"]

# 5. Suivre l'exécution
status = requests.get(
    f"http://localhost:8080/api/runs/{task_run_id}",
    headers={"Authorization": f"Bearer {analyst_token}"}
).json()
print(f"Status: {status['status']}, Progress: {status['progress_message']}")
```

### Construction des images

```bash
cd services/sandbox-runners

# Construire toutes les images
make build-all

# Construire une version Python spécifique
make build-python-version VERSION=3.12

# Construire Rust
make build-rust

# Construire Go
make build-go

# Lister les images
make list

# Voir la taille des images
make size

# Tests
make test-all
```

### Exemples de scripts

#### Python : Parsing MFT

```python
import os
import pandas as pd
from dissect.target import Target

evidence_path = os.getenv("EVIDENCE_PATH")
output_dir = os.getenv("OUTPUT_DIR")

target = Target.open(evidence_path)
mft_records = []

for entry in target.ntfs.mft():
    mft_records.append({
        "filename": entry.filename,
        "created": entry.created,
        "modified": entry.modified,
        "size": entry.size,
    })

df = pd.DataFrame(mft_records)
df.to_parquet(f"{output_dir}/mft_timeline.parquet")

print(f"Extracted {len(df)} MFT entries")
```

#### Rust : Recherche de patterns

```rust
use std::env;
use std::fs;
use std::io::Write;
use regex::Regex;

fn main() {
    let evidence_path = env::var("EVIDENCE_PATH").unwrap();
    let output_dir = env::var("OUTPUT_DIR").unwrap();

    let content = fs::read_to_string(evidence_path).expect("Failed to read evidence");
    let re = Regex::new(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b").unwrap();

    let mut results = vec![];
    for cap in re.captures_iter(&content) {
        results.push(cap[0].to_string());
    }

    let output_path = format!("{}/emails.txt", output_dir);
    let mut file = fs::File::create(output_path).expect("Failed to create output");

    for email in &results {
        writeln!(file, "{}", email).unwrap();
    }

    println!("Found {} email addresses", results.len());
}
```

#### Go : Timeline JSON

```go
package main

import (
    "encoding/json"
    "fmt"
    "os"
    "path/filepath"
    "time"
)

type Event struct {
    Timestamp time.Time `json:"timestamp"`
    Type      string    `json:"type"`
    Message   string    `json:"message"`
}

func main() {
    outputDir := os.Getenv("OUTPUT_DIR")
    caseID := os.Getenv("CASE_ID")

    events := []Event{
        {Timestamp: time.Now(), Type: "file_access", Message: "User opened document.pdf"},
        {Timestamp: time.Now(), Type: "network", Message: "Connection to 192.168.1.100"},
    }

    data, _ := json.MarshalIndent(events, "", "  ")
    outputPath := filepath.Join(outputDir, "timeline.json")
    os.WriteFile(outputPath, data, 0644)

    fmt.Printf("Generated timeline for case %s: %d events\n", caseID, len(events))
}
```

## Bonnes pratiques

### ✅ À faire

1. **Toujours valider les entrées** : Ne faites pas confiance aux chemins d'evidence
2. **Gérer les erreurs** : Capturer et logger les exceptions
3. **Limiter la mémoire** : Ne chargez pas tout le fichier en RAM
4. **Utiliser des formats standards** : Parquet, CSV, JSONL pour les outputs
5. **Logger la progression** : `print()` est capturé dans `output.txt`
6. **Respecter OUTPUT_DIR** : Tous les fichiers générés doivent y être écrits
7. **Tester localement** : Utiliser `make test-python` avant de déployer

### ❌ À éviter

1. **Pas d'accès réseau** : Le container est isolé
2. **Pas de sudo/root** : Container tourne avec user `sandbox`
3. **Pas d'écriture hors /output** : Filesystem est read-only
4. **Pas d'exécution longue** : Respecter les timeouts
5. **Pas de dépendances système** : Seules les libs Python/Rust/Go sont disponibles
6. **Pas de secrets hardcodés** : Utiliser les env vars

## Dépannage

### Image Docker n'existe pas

**Erreur** : `Error: No such image: requiem-sandbox-python:3.11`

**Solution** :
```bash
cd services/sandbox-runners
make build-python-version VERSION=3.11
```

### Timeout d'exécution

**Erreur** : `Script execution timed out after 300 seconds`

**Solution** :
- Augmenter `timeout_seconds` dans le CustomScript
- Optimiser le script pour traiter moins de données
- Utiliser des générateurs/streaming au lieu de charger tout en mémoire

### Mémoire insuffisante

**Erreur** : `Out of memory`

**Solution** :
- Augmenter `memory_limit_mb` (max recommandé : 4096)
- Traiter les données par chunks
- Utiliser `pandas.read_csv(chunksize=10000)`

### Build Rust/Go échoue

**Erreur** : `Build failed: cargo build --release`

**Solution** :
- Vérifier la syntaxe du code source
- Vérifier le format des dépendances (Cargo.toml)
- Consulter les logs dans TaskRun.error_message

### Permissions denied

**Erreur** : `Permission denied: /workspace/output.txt`

**Solution** :
- Écrire uniquement dans `/output` (pas `/workspace`)
- `/workspace` est monté en lecture seule pour la sécurité

## Roadmap

### Court terme
- ✅ Python 3.10, 3.11, 3.12
- ✅ Rust 1.75
- ✅ Go 1.21
- ⏳ Node.js 20+ (JavaScript/TypeScript)
- ⏳ C/C++ (gcc, clang)

### Moyen terme
- GPU support pour ML/AI scripts
- Distributed execution (multi-worker)
- Script versioning & rollback
- Caching de dépendances inter-exécutions
- Metrics & monitoring (Prometheus)

### Long terme
- WebAssembly support
- JIT compilation pour langages interprétés
- Auto-scaling basé sur charge
- Script marketplace public (avec review community)

## Sécurité

### Analyse de risques

| Risque | Mitigation | Priorité |
|--------|-----------|----------|
| Exécution de code malveillant | Approval workflow + isolation Docker | ✅ Haute |
| DoS (ressources infinies) | Limites CPU/Mémoire/Timeout | ✅ Haute |
| Data exfiltration | Network disabled, filesystem RO | ✅ Haute |
| Privilege escalation | Non-root user, no-new-privileges | ✅ Haute |
| Container escape | Capabilities dropped, seccomp | ✅ Moyenne |
| Fork bomb | pids-limit=100 | ✅ Moyenne |

### Audit trail

Toutes les exécutions sont enregistrées dans `TaskRun` :
- Qui (`created_by_id` via Case ownership)
- Quoi (`script_id`, `source_code` snapshot)
- Quand (`started_at_utc`, `ended_at_utc`)
- Résultat (`status`, `output_path`, `error_message`)

---

**Version** : 1.0
**Date** : 2025-11-11
**Statut** : ✅ Production-ready (Sandbox : 90%)
**Auteur** : Requiem Security Team
