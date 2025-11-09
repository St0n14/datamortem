from datetime import datetime
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Literal

router = APIRouter()

RuleType = Literal["yara", "custom", "network", "hayabusa", "sigma"]


class RuleIn(BaseModel):
    name: str = Field(..., min_length=3, max_length=200)
    logic: str = Field(..., min_length=3)
    severity: Literal["low", "medium", "high", "critical"]
    tags: List[str] = []
    scope: str = Field(..., min_length=1, description="Human readable scope (host, dataset, etc.)")
    rule_type: RuleType
    applies_to: str = Field(..., description="What the rule targets (case ID, evidence UID, index, etc.)")


RULES: List[dict] = [
    {
        "id": 1,
        "name": "lateral_movement via psexec",
        "logic": "IF source == 'PROCESS_CREATE' AND message CONTAINS 'psexec' ...",
        "severity": "high",
        "tags": ["lateral_movement", "psexec"],
        "scope": "WKST-FA-22",
        "rule_type": "custom",
        "applies_to": "case:INC-2025-TEST",
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
]


@router.get("/rules")
def list_rules():
    return RULES


@router.post("/rules")
def create_rule(rule: RuleIn):
    if any(existing["name"].lower() == rule.name.lower() for existing in RULES):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A rule with that name already exists.",
        )

    new_id = max(r["id"] for r in RULES) + 1 if RULES else 1
    new_rule = {
        "id": new_id,
        "name": rule.name,
        "logic": rule.logic,
        "severity": rule.severity,
        "tags": rule.tags,
        "scope": rule.scope,
        "rule_type": rule.rule_type,
        "applies_to": rule.applies_to,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    RULES.append(new_rule)
    return new_rule
