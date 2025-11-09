from datetime import datetime
import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

SupportedLanguage = Literal["python", "perl", "rust"]
SAFE_NAME_REGEX = re.compile(r"^[A-Za-z0-9_.-]+$")


class ScriptBase(BaseModel):
    name: str = Field(..., min_length=3, max_length=128)
    description: Optional[str] = Field(default=None, max_length=2000)
    language: SupportedLanguage = "python"

    @model_validator(mode="after")
    def validate_name(self):
        if not SAFE_NAME_REGEX.match(self.name):
            raise ValueError("Script name must contain only letters, numbers, dot, dash, underscore.")
        return self


class ScriptCreate(ScriptBase):
    source_code: str = Field(..., min_length=1)


class ScriptResponse(ScriptBase):
    id: int
    source_code: str
    created_at_utc: datetime
    created_by_id: int
    is_approved: bool
    published_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ScriptRunRequest(BaseModel):
    evidence_uid: str = Field(..., min_length=1)


class ScriptAssignRequest(BaseModel):
    user_id: int = Field(..., ge=1)


class ScriptSummary(ScriptBase):
    id: int
    is_approved: bool
    published_at: Optional[datetime] = None

    class Config:
        from_attributes = True
