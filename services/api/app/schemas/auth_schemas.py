"""
Authentication schemas for user registration, login, and token management.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field

from ..auth.roles import RoleName


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
    role: Optional[RoleName] = None
    is_active: Optional[bool] = None


class UserProfileUpdate(BaseModel):
    """Fields a regular user can modify on their own profile."""
    email: Optional[EmailStr] = None
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    full_name: Optional[str] = None


class UserInDB(UserBase):
    id: int
    role: RoleName
    is_active: bool
    is_superuser: bool
    email_verified: bool
    otp_enabled: bool
    created_at_utc: datetime
    last_login_utc: Optional[datetime]

    class Config:
        from_attributes = True


class UserPublic(UserBase):
    """Public user info without sensitive data"""
    id: int
    role: RoleName
    is_active: bool
    email_verified: bool
    otp_enabled: bool
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
    role: RoleName


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
    role: RoleName
    exp: int  # expiration timestamp


class LoginRequest(BaseModel):
    """Login credentials"""
    username: str
    password: str
    otp_code: Optional[str] = None


class RegisterRequest(UserCreate):
    """Registration request (extends UserCreate)"""
    pass


class AdminCreateUserRequest(UserCreate):
    role: RoleName


class PasswordChangeRequest(BaseModel):
    """Password change request"""
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=100)


class PasswordResetRequest(BaseModel):
    """Password reset request"""
    email: EmailStr


class EmailVerificationRequest(BaseModel):
    token: str = Field(..., min_length=10)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class OTPSetupResponse(BaseModel):
    secret: str
    otpauth_url: str


class OTPActivateRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=10)


class OTPDisableRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=10)
