from typing import List, Any, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    dm_env: str = "development"
    dm_db_url: str = "sqlite:///./dev.db"

    dm_api_base_url: str = "http://localhost:8080"

    dm_allowed_origins: Optional[str] = None

    dm_lake_root: str = "/lake"

    dm_celery_broker: str = "memory://"
    dm_celery_backend: str = "rpc://"
    dm_enable_email_verification: bool = False
    dm_email_verification_base_url: str = "http://localhost:5174/verify-email"
    dm_smtp_host: Optional[str] = None
    dm_smtp_port: int = 587
    dm_smtp_username: Optional[str] = None
    dm_smtp_password: Optional[str] = None
    dm_smtp_use_tls: bool = True
    dm_email_sender: Optional[str] = None
    dm_enable_otp: bool = False
    dm_otp_issuer: str = "dataMortem"

    # OpenSearch Configuration
    dm_opensearch_host: str = "localhost"
    dm_opensearch_port: int = 9200
    dm_opensearch_scheme: str = "http"
    dm_opensearch_user: Optional[str] = None
    dm_opensearch_password: Optional[str] = None
    dm_opensearch_verify_certs: bool = False
    dm_opensearch_ssl_show_warn: bool = False

    # Index Configuration
    dm_opensearch_index_prefix: str = "datamortem"
    dm_opensearch_shard_count: int = 1
    dm_opensearch_replica_count: int = 0
    dm_opensearch_batch_size: int = 500
    dm_opensearch_max_retries: int = 3

    dm_jwt_secret: Optional[str] = None

    # HedgeDoc integration
    dm_hedgedoc_enabled: bool = False
    dm_hedgedoc_base_url: Optional[str] = None
    dm_hedgedoc_public_url: Optional[str] = None
    dm_hedgedoc_slug_length: int = 32
    dm_hedgedoc_bootstrap_timeout: int = 5

    # Rate Limiting Configuration
    dm_rate_limit_enabled: bool = True
    dm_rate_limit_login_per_minute: int = 5
    dm_rate_limit_register_per_hour: int = 3
    dm_rate_limit_api_per_minute: int = 100
    dm_rate_limit_search_per_minute: int = 30

    @model_validator(mode="after")
    def validate_non_default_urls(self) -> "Settings":
        if self.dm_env in {"production", "staging"}:
            if self.dm_db_url.startswith("sqlite:///"):
                raise ValueError(
                    "SQLite cannot be used in staging/production. "
                    "Set dm_db_url to your managed database."
                )
            if self.dm_celery_broker.startswith("memory://"):
                raise ValueError(
                    "Celery broker must not be memory:// in staging/production."
                )
        return self

    @model_validator(mode="after")
    def ensure_secure_secret(self) -> "Settings":
        """
        Ensure dm_jwt_secret is defined and sufficiently strong.
        """
        if not self.dm_jwt_secret or len(self.dm_jwt_secret.strip()) < 32:
            raise ValueError(
                "dm_jwt_secret must be set to a random string with at least 32 characters. "
                "Update your environment (.env) before starting the API."
            )
        return self

    @model_validator(mode="after")
    def validate_email_settings(self) -> "Settings":
        if self.dm_enable_email_verification:
            if not self.dm_smtp_host:
                raise ValueError("SMTP host must be configured when email verification is enabled.")
            if not (self.dm_email_sender or self.dm_smtp_username):
                raise ValueError(
                    "Configure dm_email_sender or dm_smtp_username when email verification is enabled."
                )
        return self

    @model_validator(mode="after")
    def validate_hedgedoc_settings(self) -> "Settings":
        if self.dm_hedgedoc_enabled and not self.dm_hedgedoc_base_url:
            raise ValueError("dm_hedgedoc_base_url must be set when HedgeDoc integration is enabled.")
        return self

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

    @field_validator("dm_hedgedoc_slug_length")
    @classmethod
    def ensure_min_slug_length(cls, v: int) -> int:
        return max(16, v)

    @field_validator("dm_hedgedoc_bootstrap_timeout")
    @classmethod
    def ensure_positive_timeout(cls, v: int) -> int:
        return max(1, v)


settings = Settings()
