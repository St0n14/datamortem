"""
Authentication router for user registration, login, and management.
"""
import logging
from datetime import datetime, timedelta
from secrets import token_urlsafe

import pyotp
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import User
from ..schemas.auth_schemas import (
    LoginRequest,
    RegisterRequest,
    Token,
    UserPublic,
    UserInDB,
    PasswordChangeRequest,
    AdminCreateUserRequest,
    EmailVerificationRequest,
    ResendVerificationRequest,
    OTPSetupResponse,
    OTPActivateRequest,
    OTPDisableRequest,
    UserProfileUpdate,
)
from ..auth.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from ..auth.dependencies import (
    get_current_active_user,
    get_current_superadmin_user,
)
from ..auth.roles import ROLE_ANALYST, ROLE_SUPERADMIN
from ..services.email_service import (
    is_email_service_configured,
    send_verification_email,
)

router = APIRouter(prefix="/api/auth", tags=["authentication"])
logger = logging.getLogger(__name__)


def _prepare_email_verification(user: User) -> str | None:
    if not settings.dm_enable_email_verification:
        user.email_verified = True
        user.email_verification_token = None
        user.email_verification_sent_at = None
        return None

    token = token_urlsafe(32)
    user.email_verified = False
    user.email_verification_token = token
    user.email_verification_sent_at = datetime.utcnow()
    return token


def _ensure_email_feature_enabled() -> None:
    if not settings.dm_enable_email_verification:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email verification feature is disabled",
        )
    if not is_email_service_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMTP settings missing; contact an administrator",
        )


def _ensure_otp_enabled() -> None:
    if not settings.dm_enable_otp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP feature is disabled",
        )


@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def register(
    user_data: RegisterRequest,
    db: Session = Depends(get_db)
):
    """
    Register a new user.

    - **email**: Valid email address (unique)
    - **username**: Username (3-50 characters, unique)
    - **password**: Password (minimum 8 characters)
    - **full_name**: Optional full name
    """
    # Check if username already exists
    existing_user = db.query(User).filter(User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )

    # Check if email already exists
    existing_email = db.query(User).filter(User.email == user_data.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        role=ROLE_ANALYST,  # Default role
        is_active=True,
        is_superuser=False,
    )
    verification_token = _prepare_email_verification(new_user)

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    if verification_token:
        send_verification_email(new_user.email, new_user.username, verification_token)

    return new_user


@router.post("/users", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def admin_create_user(
    user_data: AdminCreateUserRequest,
    current_user: User = Depends(get_current_superadmin_user),
    db: Session = Depends(get_db)
):
    """
    Superadmin endpoint to create a new user with an explicit role.
    """
    existing_user = db.query(User).filter(User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )

    existing_email = db.query(User).filter(User.email == user_data.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        role=user_data.role,
        is_active=True,
        is_superuser=user_data.role == ROLE_SUPERADMIN,
    )
    verification_token = _prepare_email_verification(new_user)

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    if verification_token:
        send_verification_email(new_user.email, new_user.username, verification_token)

    return new_user


@router.post("/login", response_model=Token)
def login(
    credentials: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    Login with username and password.

    - **username**: Username
    - **password**: Password

    Returns a JWT access token valid for 24 hours.
    """
    # Find user by username
    user = db.query(User).filter(User.username == credentials.username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify password
    if not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    if settings.dm_enable_email_verification and not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email address has not been verified yet"
        )

    if settings.dm_enable_otp and user.otp_enabled:
        if not user.otp_secret:
            logger.warning("User %s has otp_enabled but missing secret", user.id)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OTP configuration is invalid"
            )
        if not credentials.otp_code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="OTP code required"
            )
        totp = pyotp.TOTP(user.otp_secret)
        if not totp.verify(credentials.otp_code, valid_window=1):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid OTP code"
            )

    # Update last login time
    user.last_login_utc = datetime.utcnow()
    db.commit()

    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    token_data = {
        "sub": str(user.id),  # JWT requires sub to be a string
        "username": user.username,
        "email": user.email,
        "role": user.role,
    }
    access_token = create_access_token(
        data=token_data,
        expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,  # seconds
    }


@router.get("/me", response_model=UserInDB)
def get_current_user_info(
    current_user: User = Depends(get_current_active_user)
):
    """
    Get current authenticated user information.

    Requires valid JWT token in Authorization header.
    """
    return current_user


@router.patch("/me", response_model=UserInDB)
def update_current_user_profile(
    user_updates: UserProfileUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Allow an authenticated user to update their own profile information
    (username, email, full name).
    """
    if not any([user_updates.username, user_updates.email, user_updates.full_name]):
        return current_user

    if user_updates.username and user_updates.username != current_user.username:
        conflict = (
            db.query(User)
            .filter(User.username == user_updates.username, User.id != current_user.id)
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken",
            )
        current_user.username = user_updates.username

    if user_updates.email and user_updates.email != current_user.email:
        conflict = (
            db.query(User)
            .filter(User.email == user_updates.email, User.id != current_user.id)
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already taken",
            )
        current_user.email = user_updates.email
        verification_token = _prepare_email_verification(current_user)
        if verification_token:
            send_verification_email(current_user.email, current_user.username, verification_token)

    if user_updates.full_name is not None:
        current_user.full_name = user_updates.full_name

    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/change-password")
def change_password(
    password_data: PasswordChangeRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Change current user's password.

    - **current_password**: Current password
    - **new_password**: New password (minimum 8 characters)
    """
    # Verify current password
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    # Update password
    current_user.hashed_password = get_password_hash(password_data.new_password)
    db.commit()

    return {"message": "Password updated successfully"}


@router.get("/users", response_model=list[UserPublic])
def list_users(
    current_user: User = Depends(get_current_superadmin_user),
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100
):
    """
    List all users (admin only).

    - **skip**: Number of users to skip (pagination)
    - **limit**: Maximum number of users to return
    """
    users = db.query(User).offset(skip).limit(limit).all()
    return users


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_superadmin_user),
    db: Session = Depends(get_db)
):
    """
    Delete a user by ID (admin only).

    - **user_id**: User ID to delete
    """
    # Prevent self-deletion
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    db.delete(user)
    db.commit()

    return {"message": f"User {user.username} deleted successfully"}


@router.post("/verify-email")
def verify_email(
    payload: EmailVerificationRequest,
    db: Session = Depends(get_db),
):
    _ensure_email_feature_enabled()

    user = (
        db.query(User)
        .filter(User.email_verification_token == payload.token)
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )

    user.email_verified = True
    user.email_verification_token = None
    user.email_verification_sent_at = None
    db.commit()

    return {"message": "Email verified successfully"}


@router.post("/resend-verification")
def resend_verification(
    payload: ResendVerificationRequest,
    db: Session = Depends(get_db),
):
    _ensure_email_feature_enabled()

    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already verified",
        )

    token = token_urlsafe(32)
    user.email_verification_token = token
    user.email_verification_sent_at = datetime.utcnow()
    db.commit()

    send_verification_email(user.email, user.username, token)
    return {"message": "Verification email resent"}


@router.post("/otp/setup", response_model=OTPSetupResponse)
def otp_setup(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    _ensure_otp_enabled()

    secret = pyotp.random_base32()
    current_user.otp_secret = secret
    current_user.otp_enabled = False
    db.commit()

    issuer = settings.dm_otp_issuer or "dataMortem"
    identity = current_user.email or current_user.username
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(name=identity, issuer_name=issuer)

    return OTPSetupResponse(secret=secret, otpauth_url=provisioning_uri)


@router.post("/otp/activate")
def otp_activate(
    payload: OTPActivateRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    _ensure_otp_enabled()

    if not current_user.otp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Generate a secret with /otp/setup first",
        )

    totp = pyotp.TOTP(current_user.otp_secret)
    if not totp.verify(payload.code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP code",
        )

    current_user.otp_enabled = True
    db.commit()
    return {"message": "OTP enabled"}


@router.post("/otp/disable")
def otp_disable(
    payload: OTPDisableRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    _ensure_otp_enabled()

    if not current_user.otp_enabled or not current_user.otp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP is not active",
        )

    totp = pyotp.TOTP(current_user.otp_secret)
    if not totp.verify(payload.code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP code",
        )

    current_user.otp_enabled = False
    current_user.otp_secret = None
    db.commit()
    return {"message": "OTP disabled"}
