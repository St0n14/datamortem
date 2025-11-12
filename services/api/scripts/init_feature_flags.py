"""
Script to initialize feature flags in the database.
Run this if the migration hasn't been executed yet or if feature flags are missing.
"""
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db import SessionLocal
from app.models import FeatureFlag
from datetime import datetime


def init_feature_flags():
    """Initialize default feature flags if they don't exist."""
    db = SessionLocal()
    try:
        # Check if any feature flags exist
        existing_count = db.query(FeatureFlag).count()
        
        if existing_count > 0:
            print(f"✓ {existing_count} feature flag(s) already exist in the database.")
            flags = db.query(FeatureFlag).all()
            for flag in flags:
                print(f"  - {flag.feature_key}: {'enabled' if flag.enabled else 'disabled'}")
            return

        # Default feature flags
        default_flags = [
            {
                "feature_key": "account_creation",
                "enabled": True,
                "description": "Permet la création de nouveaux comptes utilisateurs",
            },
            {
                "feature_key": "marketplace",
                "enabled": True,
                "description": "Permet l'accès au marketplace de scripts",
            },
            {
                "feature_key": "pipeline",
                "enabled": True,
                "description": "Permet l'utilisation de la pipeline d'analyse",
            },
        ]

        print("Creating default feature flags...")
        for flag_data in default_flags:
            flag = FeatureFlag(
                feature_key=flag_data["feature_key"],
                enabled=flag_data["enabled"],
                description=flag_data["description"],
                updated_at_utc=datetime.utcnow(),
            )
            db.add(flag)
            print(f"  ✓ Created: {flag_data['feature_key']}")

        db.commit()
        print("\n✓ Feature flags initialized successfully!")
        
    except Exception as e:
        db.rollback()
        print(f"✗ Error initializing feature flags: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    init_feature_flags()

