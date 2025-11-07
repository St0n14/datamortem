from typing import List, Any, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator


class Settings(BaseSettings):
    dm_env: str = "dev"
    dm_db_url: str = "sqlite:///./dev.db"

    # ⚠️ IMPORTANT : on force le type brut à str | None au lieu de List[str]
    # pour empêcher pydantic_settings de tenter json.loads() trop tôt.
    dm_allowed_origins: Optional[str] = (
        "http://127.0.0.1:5174,http://localhost:5174"
    )

    dm_lake_root: str = "/lake"

    dm_celery_broker: str = "memory://"
    dm_celery_backend: str = "rpc://"

    # OpenSearch Configuration
    dm_opensearch_host: str = "localhost"
    dm_opensearch_port: int = 9200
    dm_opensearch_scheme: str = "http"              # "http" dev, "https" prod
    dm_opensearch_user: Optional[str] = None        # None = no auth (dev)
    dm_opensearch_password: Optional[str] = None
    dm_opensearch_verify_certs: bool = False        # Dev: False, Prod: True
    dm_opensearch_ssl_show_warn: bool = False       # Pas de warnings SSL en dev

    # Index Configuration
    dm_opensearch_index_prefix: str = "datamortem"  # prefix pour tous les index
    dm_opensearch_shard_count: int = 1              # Dev: 1, Prod: 3+
    dm_opensearch_replica_count: int = 0            # Dev: 0, Prod: 1+
    dm_opensearch_batch_size: int = 500             # Bulk indexing batch size
    dm_opensearch_max_retries: int = 3              # Retry failed indexing

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    @field_validator("dm_allowed_origins", mode="before")
    @classmethod
    def normalize_allowed_origins_raw(cls, v: Any) -> Optional[str]:
        """
        On veut juste être sûrs que ce champ reste une simple string propre,
        pas du JSON. On renvoie toujours une string ou None.
        """
        if v is None:
            return None
        if isinstance(v, list):
            # quelqu'un aurait mis un vrai JSON style ["a","b"] dans l'env
            # -> on le rabaisse en "a,b"
            joined = ",".join([str(x).strip() for x in v if str(x).strip()])
            return joined if joined else None
        if isinstance(v, str):
            # on trim et on vire les espaces parasites
            s = v.strip()
            return s if s != "" else None
        # fallback
        return str(v)

    def allowed_origins_list(self) -> List[str]:
        """
        C'est CE getter qu'on utilisera dans main.py pour configurer CORS.
        Il renvoie toujours une liste de strings.
        """
        default_list = [
            "http://127.0.0.1:5174",
            "http://localhost:5174",
        ]

        raw = self.dm_allowed_origins
        if raw is None or raw.strip() == "":
            return default_list

        # split CSV
        parts = [p.strip() for p in raw.split(",") if p.strip()]
        return parts if parts else default_list

    @property
    def opensearch_url(self) -> str:
        """Construit l'URL complète OpenSearch"""
        return f"{self.dm_opensearch_scheme}://{self.dm_opensearch_host}:{self.dm_opensearch_port}"


settings = Settings()
