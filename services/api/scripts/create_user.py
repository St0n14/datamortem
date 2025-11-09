import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db import SessionLocal
from app.auth.security import get_password_hash
from app.models import User

session = SessionLocal()
user = User(
    email="analyst@example.com",
    username="analyst01",
    full_name="Analyste Demo",
    hashed_password=get_password_hash("StrongPass#42"),
    role="analyst",
    is_active=True,
)
session.add(user)
session.commit()
print("OK")
session.close()
