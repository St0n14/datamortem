from typing import List, Dict
from threading import Lock
EVENT_BUFFER: List[Dict] = []
EVENT_LOCK = Lock()

def add_events(new_events: List[Dict]):
    """
    Append de nouveaux events normalisés dans le buffer global.
    On lock pour éviter les race conditions si plusieurs tasks écrivent.
    """
    with EVENT_LOCK:
        start_id = len(EVENT_BUFFER) + 1
        for i, ev in enumerate(new_events):
            ev_with_id = ev.copy()
            ev_with_id["id"] = start_id + i
            EVENT_BUFFER.append(ev_with_id)

def get_events(case_id: str | None = None) -> List[Dict]:
    """
    Récupère les events. Si case_id est fourni, on filtre.
    """
    with EVENT_LOCK:
        if case_id:
            return [e for e in EVENT_BUFFER if e.get("case_id") == case_id]
        else:
            return list(EVENT_BUFFER)
