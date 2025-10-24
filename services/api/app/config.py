import os

class Settings:
    DATABASE_URL = os.getenv("DATABASE_URL")
    REDIS_URL = os.getenv("REDIS_URL")
    MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT")
    MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY")
    MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY")
    MINIO_BUCKET_EVIDENCE = os.getenv("MINIO_BUCKET_EVIDENCE")
    MINIO_BUCKET_LAKE = os.getenv("MINIO_BUCKET_LAKE")

settings = Settings()
