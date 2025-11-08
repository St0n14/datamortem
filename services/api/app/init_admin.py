"""
Initialize default admin user for dataMortem.
Run this script after database migrations to create the default administrator.
"""
from app.db import SessionLocal
from app.models import User
from app.auth.security import get_password_hash


def create_default_admin():
    """Create default admin user if it doesn't exist."""
    db = SessionLocal()
    try:
        # Check if admin exists
        admin = db.query(User).filter(User.username == "admin").first()
        if admin:
            print("ℹ️  Admin user already exists")
            print(f"   Username: {admin.username}")
            print(f"   Email: {admin.email}")
            print(f"   Role: {admin.role}")
            return

        # Create admin
        admin_user = User(
            email="admin@example.com",
            username="admin",
            hashed_password=get_password_hash("admin123"),
            full_name="Default Administrator",
            role="admin",
            is_active=True,
            is_superuser=True,
        )
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)

        print("✅ Default admin created successfully!")
        print("")
        print("=" * 60)
        print("🔐 DEFAULT ADMIN CREDENTIALS")
        print("=" * 60)
        print(f"   Email:    {admin_user.email}")
        print(f"   Username: {admin_user.username}")
        print(f"   Password: admin123")
        print("")
        print("⚠️  IMPORTANT: Change this password immediately after first login!")
        print("=" * 60)
        print("")
        print("To login:")
        print('  curl -X POST http://localhost:8000/api/auth/login \\')
        print('    -H "Content-Type: application/json" \\')
        print('    -d \'{"username": "admin", "password": "admin123"}\'')
        print("")

    except Exception as e:
        print(f"❌ Error creating admin user: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    create_default_admin()
