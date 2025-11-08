"""
Authentication schemas for user registration, login, and token management.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


# ==================
# User Schemas
# ==================
class UserBase(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    full_name: Optional[str] = None


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=100)


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    full_name: Optional[str] = None
    password: Optional[str] = Field(None, min_length=8, max_length=100)
    role: Optional[str] = None
    is_active: Optional[bool] = None


class UserInDB(UserBase):
    id: int
    role: str
    is_active: bool
    is_superuser: bool
    created_at_utc: datetime
    last_login_utc: Optional[datetime]

    class Config:
        from_attributes = True


class UserPublic(UserBase):
    """Public user info without sensitive data"""
    id: int
    role: str
    is_active: bool
    created_at_utc: datetime

    class Config:
        from_attributes = True


# ==================
# Authentication Schemas
# ==================
class TokenData(BaseModel):
    """Data stored in JWT token"""
    user_id: int
    username: str
    email: str
    role: str


class Token(BaseModel):
    """JWT token response"""
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class TokenPayload(BaseModel):
    """JWT token payload"""
    sub: int  # user_id
    username: str
    email: str
    role: str
    exp: int  # expiration timestamp


class LoginRequest(BaseModel):
    """Login credentials"""
    username: str
    password: str


class RegisterRequest(UserCreate):
    """Registration request (extends UserCreate)"""
    pass


class PasswordChangeRequest(BaseModel):
    """Password change request"""
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=100)


class PasswordResetRequest(BaseModel):
    """Password reset request"""
    email: EmailStr
