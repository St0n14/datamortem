import logging
import secrets
import string
from dataclasses import dataclass
from typing import Optional

import requests

from ..config import settings

logger = logging.getLogger(__name__)


def _generate_slug(length: int) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


@dataclass
class HedgeDocNoteMeta:
    slug: str
    url: Optional[str]


class HedgeDocManager:
    """
    Minimal helper to provision per-case HedgeDoc pads.
    We rely on HedgeDoc creating a note automatically when a new slug is requested.
    """

    def __init__(self) -> None:
        self.enabled = settings.dm_hedgedoc_enabled and bool(settings.dm_hedgedoc_base_url)
        self.internal_base = settings.dm_hedgedoc_base_url.rstrip("/") if settings.dm_hedgedoc_base_url else None
        public = settings.dm_hedgedoc_public_url or settings.dm_hedgedoc_base_url
        self.public_base = public.rstrip("/") if public else None
        self.slug_length = settings.dm_hedgedoc_slug_length
        self.timeout = settings.dm_hedgedoc_bootstrap_timeout

    def provision_case_note(self, case_id: str) -> Optional[HedgeDocNoteMeta]:
        if not self.enabled or not self.internal_base:
            return None

        slug = _generate_slug(self.slug_length)
        share_url = self.build_share_url(slug)
        internal_url = f"{self.internal_base}/{slug}"

        try:
            # Trigger note creation ahead of time so the link is ready when the user opens it.
            requests.get(internal_url, timeout=self.timeout)
        except requests.RequestException as exc:
            logger.warning("Failed to pre-create HedgeDoc note for %s: %s", case_id, exc)

        return HedgeDocNoteMeta(slug=slug, url=share_url)

    def build_share_url(self, slug: Optional[str]) -> Optional[str]:
        if not slug or not self.public_base:
            return None
        return f"{self.public_base}/{slug}"


hedgedoc_manager = HedgeDocManager()
