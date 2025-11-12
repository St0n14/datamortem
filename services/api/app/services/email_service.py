"""
Utility helpers to send transactional emails (verification, notifications).
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from typing import Optional

from ..config import settings

logger = logging.getLogger(__name__)


def is_email_service_configured() -> bool:
    """
    Returns True if SMTP settings are available.
    """
    return bool(settings.dm_smtp_host and (settings.dm_email_sender or settings.dm_smtp_username))


def _build_verification_link(token: str) -> str:
    """
    Construct the verification link using the configured base URL.

    Supports templates containing {token}; otherwise appends ?token=...
    """
    base = settings.dm_email_verification_base_url or ""
    if "{token}" in base:
        return base.replace("{token}", token)

    separator = "&" if "?" in base else "?"
    return f"{base}{separator}token={token}"


def send_email(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
) -> None:
    """
    Send an email via SMTP using the configured settings.
    """
    if not is_email_service_configured():
        logger.warning("SMTP settings missing, cannot send email to %s", to_email)
        return

    msg = EmailMessage()
    sender = settings.dm_email_sender or settings.dm_smtp_username
    msg["From"] = sender
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(text_body)

    if html_body:
        msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(settings.dm_smtp_host, settings.dm_smtp_port, timeout=10) as server:
            if settings.dm_smtp_use_tls:
                server.starttls()
            if settings.dm_smtp_username and settings.dm_smtp_password:
                server.login(settings.dm_smtp_username, settings.dm_smtp_password)
            server.send_message(msg)
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to_email, exc)


def send_verification_email(to_email: str, username: str, token: str) -> None:
    """
    Send a verification email containing the confirmation link for the user.
    """
    if not settings.dm_enable_email_verification:
        return

    link = _build_verification_link(token)
    subject = "Verify your Requiem account"
    text_body = (
        f"Hello {username},\n\n"
        "Please verify your email address to activate your Requiem account.\n"
        f"Verification link: {link}\n\n"
        "If you did not request this account, please ignore this email."
    )
    html_body = (
        f"<p>Hello <strong>{username}</strong>,</p>"
        "<p>Please verify your email address to activate your Requiem account.</p>"
        f"<p><a href=\"{link}\">Verify my email</a></p>"
        "<p>If you did not request this account, you can ignore this email.</p>"
    )
    send_email(to_email, subject, text_body, html_body)
