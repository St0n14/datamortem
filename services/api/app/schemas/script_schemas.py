from datetime import datetime
import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

SupportedLanguage = Literal["python", "perl", "rust"]
SAFE_NAME_REGEX = re.compile(r"^[A-Za-z0-9_.-]+$")
PY_VERSION_REGEX = re.compile(r"^(python)?\d+(\.\d+)?$")


class ScriptBase(BaseModel):
    name: str = Field(..., min_length=3, max_length=128)
    description: Optional[str] = Field(default=None, max_length=2000)
    language: SupportedLanguage = "python"
    python_version: str = Field(default="3.11", description="Python runtime version (e.g., 3.11)")
    requirements: Optional[str] = Field(
        default=None,
        description="Optional pip requirements, one per line",
    )

    @model_validator(mode="after")
    def validate_fields(self):
        if not SAFE_NAME_REGEX.match(self.name):
            raise ValueError("Script name must contain only letters, numbers, dot, dash, underscore.")
        if self.language == "python":
            version = self.python_version.strip()
            if not PY_VERSION_REGEX.match(version):
                raise ValueError("python_version must look like '3.11' or 'python3.11'")
        return self


class ScriptCreate(ScriptBase):
    source_code: str = Field(..., min_length=1)


class ScriptUpdate(BaseModel):
    """Schema for updating script fields"""
    source_code: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = Field(default=None, max_length=2000)
    python_version: Optional[str] = Field(default=None, description="Python runtime version (e.g., 3.11)")
    requirements: Optional[str] = Field(
        default=None,
        description="Optional pip requirements, one per line",
    )

    @model_validator(mode="after")
    def validate_fields(self):
        if self.python_version:
            version = self.python_version.strip()
            if not PY_VERSION_REGEX.match(version):
                raise ValueError("python_version must look like '3.11' or 'python3.11'")
        return self


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
