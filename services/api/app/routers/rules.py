from fastapi import APIRouter
from pydantic import BaseModel
from typing import List

router = APIRouter()

class RuleIn(BaseModel):
    name: str
    logic: str
    severity: str
    tags: List[str]
    scope: str

RULES = [
    {
        "id": 1,
        "name": "lateral_movement via psexec",
        "logic": "IF source == 'PROCESS_CREATE' AND message CONTAINS 'psexec' ...",
        "severity": "HIGH",
        "tags": ["lateral_movement", "psexec"],
        "scope": "WKST-FA-22"
    }
]

@router.get("/rules")
def list_rules():
    return RULES

@router.post("/rules")
def create_rule(rule: RuleIn):
    new_id = max(r["id"] for r in RULES) + 1 if RULES else 1
    new_rule = {
        "id": new_id,
        "name": rule.name,
        "logic": rule.logic,
        "severity": rule.severity,
        "tags": rule.tags,
        "scope": rule.scope,
    }
    RULES.append(new_rule)
    return {"ok": True, "id": new_id}
