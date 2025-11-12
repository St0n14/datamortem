from celery import Celery
from .config import settings

# Configuration Celery depuis settings
# En dev: peut être memory:// (eager mode) ou redis:// (vrai worker)
# En prod: redis:// avec worker dédié

celery_app = Celery(
    "Requiem",
    broker=settings.dm_celery_broker,
    backend=settings.dm_celery_backend,
    include=[
        "app.tasks.parse_mft",
        "app.tasks.index_results",   # OpenSearch indexation task
        "app.tasks.sample_long_task",
        "app.tasks.generate_test_events",  # Test event generator
        "app.tasks.parse_dissect",   # Dissect forensic parser
        "app.tasks.dissect_mft",     # Dedicated MFT extraction via dissect.target
        "app.tasks.run_custom_script",
        # "app.tasks.parse_registry",
        # "app.tasks.parse_users",
    ],
)

# Détermine si on est en mode eager (memory://) ou worker (redis://)
is_eager_mode = settings.dm_celery_broker.startswith("memory://")

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,

    # Mode eager uniquement si broker = memory://
    task_always_eager=is_eager_mode,
    task_eager_propagates=is_eager_mode,
)
