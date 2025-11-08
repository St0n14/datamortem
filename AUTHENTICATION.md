# Authentication Guide

dataMortem now includes a complete JWT-based authentication system to secure your digital forensics platform.

## Quick Start

### 1. Generate a Secure JWT Secret

Before running in production, generate a secure random secret:

```bash
openssl rand -hex 32
```

Set this value in your environment:

```bash
export DM_JWT_SECRET=<your_generated_secret>
```

For development, a default insecure key is provided in `docker-compose.yml`.

### 2. Start the Stack

```bash
./start-stack.sh
```

### 3. Register Your First User

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "username": "admin",
    "password": "SecurePassword123!",
    "full_name": "Admin User"
  }'
```

### 4. Login

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "SecurePassword123!"
  }'
```

Response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 86400
}
```

### 5. Use the Token

Include the token in the `Authorization` header for protected endpoints:

```bash
curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer <your_access_token>"
```

## API Endpoints

### Public Endpoints (No Authentication Required)

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login and get JWT token
- `GET /health` - Health check

### Protected Endpoints (Require Authentication)

- `GET /api/auth/me` - Get current user info
- `POST /api/auth/change-password` - Change password
- All case, evidence, search, and pipeline endpoints

### Admin-Only Endpoints

- `GET /api/auth/users` - List all users
- `DELETE /api/auth/users/{user_id}` - Delete a user

## User Roles

dataMortem supports role-based access control (RBAC):

- **admin**: Full access to all features, can manage users
- **analyst**: Can create cases, upload evidence, run analyses
- **viewer**: Read-only access to cases and data

Default role for new users: `analyst`

## Security Best Practices

### Production Deployment

1. **Generate a Strong JWT Secret**
   ```bash
   openssl rand -hex 32 > /secure/location/jwt_secret.txt
   DM_JWT_SECRET=$(cat /secure/location/jwt_secret.txt)
   ```

2. **Use HTTPS/TLS**
   - Enable OpenSearch security plugin
   - Configure reverse proxy (Nginx/Traefik) with SSL
   - Use TLS for PostgreSQL connections

3. **Rotate Secrets Regularly**
   - Rotate JWT secret every 90 days
   - Update database passwords quarterly
   - Use a secrets manager (HashiCorp Vault, AWS Secrets Manager)

4. **Environment Variables**
   - Never commit secrets to git
   - Use `.env` files (in `.gitignore`)
   - Or use cloud provider secrets (AWS Parameter Store, GCP Secret Manager)

### Password Requirements

- Minimum 8 characters
- Maximum 100 characters
- Hashed using bcrypt with automatic salt

### Token Lifecycle

- Access tokens expire after 24 hours
- No refresh tokens yet (planned feature)
- Users must re-login after token expiration

## Migrating Existing Data

If you have existing cases without user ownership:

```python
# Run this in a Python shell or migration script
from app.db import SessionLocal
from app.models import Case, User

db = SessionLocal()

# Find or create a default user
default_user = db.query(User).filter(User.username == "admin").first()

# Assign ownership to existing cases
cases_without_owner = db.query(Case).filter(Case.owner_id == None).all()
for case in cases_without_owner:
    case.owner_id = default_user.id

db.commit()
```

## Troubleshooting

### "Invalid or expired token"

- Token may have expired (24h lifespan)
- Login again to get a new token
- Verify DM_JWT_SECRET is consistent across restarts

### "User not found"

- Ensure user exists in database
- Check PostgreSQL is healthy: `docker logs datamortem-postgres`

### "Not enough permissions"

- Check user role: `GET /api/auth/me`
- Admin endpoints require `role=admin`

## Next Steps

- [ ] Implement refresh tokens
- [ ] Add password reset via email
- [ ] Implement OAuth2/SSO (SAML, Google, GitHub)
- [ ] Add multi-factor authentication (MFA)
- [ ] Implement API key authentication for CI/CD

## API Documentation

Full interactive API documentation available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
