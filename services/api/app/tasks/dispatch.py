from .parse_mft import parse_mft_task
from .parse_registry import parse_registry_task
from .parse_users import parse_users_task

_TASK_MAP = {
    "parse_mft": parse_mft_task,
    "parse_registry": parse_registry_task,
    "parse_users": parse_users_task,
}

def dispatch_module_task(module_name: str, evidence_uid: str, task_run_id: int):
    task_fn = _TASK_MAP.get(module_name)
    if not task_fn:
        # À ce stade, si un module n'est pas mappé ici, on ne sait pas l'exécuter
        raise ValueError(f"Unknown module {module_name}")
    task_fn.delay(evidence_uid=evidence_uid, task_run_id=task_run_id)
