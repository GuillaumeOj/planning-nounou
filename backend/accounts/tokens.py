"""Invitation-token helpers, shared by family and contract invitations.

A leaf module (no model imports) so both ``accounts`` (family invitations) and
``contracts`` (contract invitations) can use these as field defaults without an
app importing another app's ``models``.
"""

from __future__ import annotations

import secrets
from datetime import timedelta

from django.utils import timezone


def generate_invitation_token() -> str:
    """A URL-safe secret embedded in the invite link."""
    return secrets.token_urlsafe(32)


def default_invitation_expiry():
    """Invitations are actionable for a week by default."""
    return timezone.now() + timedelta(days=7)
