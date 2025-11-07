from sqlalchemy.orm import Session

from .db import SessionLocal, Base, engine
from .models import AnalysisModule


# Définition des modules autorisés dans l'UI/pipeline.
# IMPORTANT: "tool" doit matcher une clé existante dans TASK_REGISTRY du router pipeline.
MODULE_DEFINITIONS = [
    {
        "name": "parse_mft",
        "description": "Extract $MFT from evidence and export timeline CSV",
        "tool": "parse_mft",
        "enabled": True,
    },
    {
        "name": "sample_long_task",
        "description": "Demo long-running task to test status/progress",
        "tool": "sample_long_task",
        "enabled": True,
    },
    # tu pourras en rajouter ici plus tard
]


def main():
    # 1. S'assurer que les tables existent (équivaut à ton Base.metadata.create_all)
    Base.metadata.create_all(bind=engine)

    db: Session = SessionLocal()
    try:
        for mod_def in MODULE_DEFINITIONS:
            existing = (
                db.query(AnalysisModule)
                .filter_by(name=mod_def["name"])
                .one_or_none()
            )
            if existing:
                # Update "doux" (idempotent)
                existing.description = mod_def["description"]
                existing.tool = mod_def["tool"]
                existing.enabled = mod_def["enabled"]
                print(
                    f"[seed] updated module {existing.name} (id={existing.id})"
                )
            else:
                new_mod = AnalysisModule(
                    name=mod_def["name"],
                    description=mod_def["description"],
                    tool=mod_def["tool"],
                    enabled=mod_def["enabled"],
                )
                db.add(new_mod)
                db.commit()
                db.refresh(new_mod)
                print(
                    f"[seed] created module {new_mod.name} (id={new_mod.id})"
                )

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
