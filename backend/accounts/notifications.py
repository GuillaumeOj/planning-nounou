"""Send Brevo-hosted transactional templates for the invitation flows.

The auth emails go through djoser (see accounts/email.py); invitations don't, so this
module is the equivalent plumbing for them: pick the Brevo template id for the request's
active language and hand Anymail's Brevo backend ``template_id`` + ``merge_global_data``
on the message. Kept as a leaf so both apps use it — accounts for family invites (below)
and contracts for contract-share invites (contracts/notifications.py), mirroring how
accounts/tokens.py is shared.

Both send() calls run inside the inviter's request, so ``get_language()`` (set by
LocaleMiddleware from Accept-Language) is a reliable language signal — same reasoning as
the auth emails, no per-invitee language is stored.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from anymail.message import AnymailMessage
from django.conf import settings
from django.utils.translation import get_language

from .models import FamilyMembership

if TYPE_CHECKING:
    from .models import Invitation, User

# Mirrors accounts/email.py: the SPA sends an explicit fr/en Accept-Language, an
# unsupported/missing header resolves upstream to LANGUAGE_CODE ("en"), and this
# fallback only guards get_language() returning nothing.
FALLBACK_LANGUAGE = "fr"
SUPPORTED_LANGUAGES = ("fr", "en")


def active_language() -> str:
    """The request's active language normalized to a supported ``fr``/``en`` code."""
    lang = (get_language() or FALLBACK_LANGUAGE).split("-")[0].lower()
    return lang if lang in SUPPORTED_LANGUAGES else FALLBACK_LANGUAGE


def frontend_url(path: str) -> str:
    """Absolute SPA URL for ``path`` (e.g. ``invite/<token>``)."""
    return f"{settings.FRONTEND_PROTOCOL}://{settings.FRONTEND_DOMAIN}/{path.lstrip('/')}"


def display_name(user: User | None) -> str:
    """A human name for the inviter, or "" when unknown (email is never leaked)."""
    if user is None:
        return ""
    return f"{user.first_name} {user.last_name}".strip()


def send_template_email(*, template_key: str, to: str, params: dict) -> None:
    """Send the ``template_key`` Brevo template, in the active language, to ``to``.

    ``site_name`` is always provided; callers add the template's own merge params.
    """
    # template_id + merge_global_data are what the Anymail Brevo backend reads instead
    # of a locally rendered body; AnymailMessage declares them so no HTML body is built.
    message = AnymailMessage(
        to=[to],
        template_id=settings.BREVO_TEMPLATE_IDS[template_key][active_language()],
        merge_global_data={"site_name": settings.SITE_NAME, **params},
    )
    message.send()


def send_family_invitation_email(invitation: Invitation) -> None:
    """Email the invitee a link to join the family they were invited to."""
    send_template_email(
        template_key="family_invitation",
        to=invitation.email,
        params={
            "inviter_name": display_name(invitation.invited_by),
            "family_name": invitation.family.name,
            "role": str(FamilyMembership.Role(invitation.role).label),
            "accept_url": frontend_url(f"invite/{invitation.token}"),
        },
    )
