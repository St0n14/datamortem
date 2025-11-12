# 🎯 PROCHAINES ÉTAPES - Phase 1 Terminée

## ✅ Ce qui vient d'être fait (Phase 1)

1. ✅ **Système d'authentification complet** 
   - Modèle User avec RBAC
   - JWT tokens (24h)
   - Password hashing (bcrypt)
   - 6 endpoints d'auth
   - Middleware de protection

2. ✅ **Documentation créée**
   - AUTHENTICATION.md (guide complet)
   - PHASE1_COMPLETE.md (résumé)
   - .env.example (template config)

3. ✅ **Dependencies ajoutées**
   - PyJWT, Passlib, Bcrypt

## 🚀 Étapes suivantes IMMÉDIATES

### Étape 2A: Setup Alembic (15-20 min)

```bash
# 1. Initialiser Alembic
cd services/api
uv run alembic init alembic

# 2. Configurer alembic.ini
# Éditer: sqlalchemy.url = pas utilisé (on prend de config.py)

# 3. Éditer alembic/env.py
# - Import Base et settings
# - Configurer target_metadata = Base.metadata
# - Configurer db_url depuis settings.dm_db_url

# 4. Créer la première migration
uv run alembic revision --autogenerate -m "Add users table and user foreign key to cases"

# 5. Appliquer la migration
uv run alembic upgrade head
```

**Fichiers à créer/modifier**:
- ✅ `alembic/` (généré automatiquement)
- ✏️ `alembic.ini` (configurer)
- ✏️ `alembic/env.py` (configurer)
- ✏️ `alembic/versions/xxx_add_users_table.py` (migration)

### Étape 2B: Créer un admin par défaut (5 min)

```bash
# Créer un script d'initialisation
cat > services/api/app/init_admin.py << 'SCRIPT'
from app.db import SessionLocal
from app.models import User
from app.auth.security import get_password_hash

def create_default_admin():
    db = SessionLocal()
    try:
        # Check if admin exists
        admin = db.query(User).filter(User.username == "admin").first()
        if admin:
            print("❌ Admin user already exists")
            return
        
        # Create admin
        admin_user = User(
            email="admin@requiem.local",
            username="admin",
            hashed_password=get_password_hash("changeme123"),
            full_name="Default Administrator",
            role="admin",
            is_active=True,
            is_superuser=True,
        )
        db.add(admin_user)
        db.commit()
        print("✅ Default admin created:")
        print("   Username: admin")
        print("   Password: changeme123")
        print("   ⚠️  CHANGE THIS PASSWORD IMMEDIATELY!")
    finally:
        db.close()

if __name__ == "__main__":
    create_default_admin()
SCRIPT

# Exécuter
cd services/api
uv run python -m app.init_admin
```

### Étape 2C: Tester l'authentification (10 min)

```bash
# 1. Démarrer la stack
./start-stack.sh

# 2. Attendre que tout soit prêt (30s)

# 3. Créer un utilisateur
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "analyst@test.com",
    "username": "analyst",
    "password": "SecurePass123!",
    "full_name": "Test Analyst"
  }'

# 4. Login
TOKEN=$(curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "analyst",
    "password": "SecurePass123!"
  }' | jq -r '.access_token')

echo "Token: $TOKEN"

# 5. Tester l'accès authentifié
curl -X GET http://localhost:8080/api/auth/me \
  -H "Authorization: Bearer $TOKEN"

# 6. Tester Swagger UI
open http://localhost:8080/docs
# Cliquer "Authorize", entrer: Bearer <token>
```

## 📋 TODO List Complète

### 🔴 P0 - Cette semaine (4-6h)
- [ ] Setup Alembic et créer migration users
- [ ] Script init_admin.py
- [ ] Tester l'auth end-to-end
- [ ] Protéger les endpoints existants (cases, evidence)
- [ ] Documenter comment déployer en prod

### 🟠 P1 - Semaine prochaine (6-8h)
- [ ] Backup script PostgreSQL (pg_dump)
- [ ] GitHub Actions basique (lint + tests)
- [ ] Tests unitaires auth (pytest)
- [ ] Rate limiting sur /auth/login
- [ ] Audit logging basique

### 🟡 P2 - Dans 2-3 semaines (10-15h)
- [ ] Monitoring: Prometheus + Grafana
- [ ] CI/CD complet (build + deploy staging)
- [ ] Tests d'intégration
- [ ] Secrets vault (HashiCorp Vault ou AWS)
- [ ] HTTPS avec Traefik + Let's Encrypt

### 🟢 P3 - Dans 1-2 mois (20-30h)
- [ ] Kubernetes manifests + Helm
- [ ] High Availability (PostgreSQL replica, OpenSearch cluster)
- [ ] Refresh tokens
- [ ] OAuth2/SSO
- [ ] Production deployment

## 🧪 Commandes utiles

### Développement
```bash
# Démarrer la stack
./start-stack.sh

# Voir les logs API
docker logs -f requiem-api

# Voir les logs Celery
docker logs -f requiem-celery

# Entrer dans le container API
docker exec -it requiem-api sh

# Lancer Python shell
docker exec -it requiem-api uv run python

# Rebuild après changements
docker-compose up -d --build api
```

### Base de données
```bash
# Accéder à PostgreSQL
docker exec -it requiem-postgres psql -U requiem -d requiem

# Voir les tables
\dt

# Voir les users
SELECT id, username, email, role, is_active FROM users;

# Backup manuel
docker exec requiem-postgres pg_dump -U requiem requiem > backup.sql

# Restore
docker exec -i requiem-postgres psql -U requiem requiem < backup.sql
```

### Alembic (après setup)
```bash
# Créer une migration
cd services/api
uv run alembic revision --autogenerate -m "description"

# Appliquer les migrations
uv run alembic upgrade head

# Voir l'historique
uv run alembic history

# Rollback
uv run alembic downgrade -1
```

## 📚 Ressources

### Documentation officielle
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [PyJWT](https://pyjwt.readthedocs.io/)
- [Passlib](https://passlib.readthedocs.io/)
- [Alembic](https://alembic.sqlalchemy.org/)
- [SQLAlchemy 2.0](https://docs.sqlalchemy.org/en/20/)

### Best Practices
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [NIST Password Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)

## 🎯 Objectif final

**Production-Ready Checklist (objectif 3-6 mois)**:
- [x] Authentication (80% done)
- [ ] Authorization (60% done - need endpoint protection)
- [ ] Database Migrations (0% - Alembic setup needed)
- [ ] Backups (0%)
- [ ] Monitoring (0%)
- [ ] CI/CD (0%)
- [ ] Tests (0%)
- [ ] HTTPS/TLS (0%)
- [ ] Secrets Management (20%)
- [ ] High Availability (0%)
- [ ] Documentation (40%)
- [ ] Audit Logging (0%)

**Current Progress: 40-45% Production Ready** 🎉

---

**👏 Félicitations pour la Phase 1 !**

Vous avez franchi une étape majeure. Le système d'authentification est en place, solid et extensible.

**Next command to run**:
```bash
cd services/api && uv run alembic init alembic
```

Bonne chance ! 🚀
