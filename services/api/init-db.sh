#!/bin/sh
# Database initialization script
# Runs Alembic migrations and creates default admin user

echo "=========================================="
echo "🚀 Initializing Requiem Database"
echo "=========================================="
echo ""

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL..."
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if uv run python -c "from app.db import engine; engine.connect()" 2>/dev/null; then
        echo "✅ PostgreSQL is ready"
        break
    fi
    attempt=$((attempt + 1))
    echo "   Attempt $attempt/$max_attempts..."
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo "❌ PostgreSQL is not available after $max_attempts attempts"
    exit 1
fi

echo ""
echo "📦 Running database migrations..."
uv run alembic upgrade head || uv run alembic stamp head

echo "✅ Migrations completed"
echo ""

echo "👤 Initializing default admin user..."
uv run python -m app.init_admin

echo ""
echo "=========================================="
echo "✅ Database initialization complete"
echo "=========================================="
