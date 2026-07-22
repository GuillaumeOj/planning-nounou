"""Send the contract-share invitation email.

Reuses the shared Brevo plumbing in accounts/notifications.py (template selection by
the request's active language, Anymail message shaping). Only the merge params and the
frontend path are contract-specific. The invite link points at ``contract-invite/<token>``,
the SPA route that previews the invite and, for a signed-out invitee, funnels them through
registration (via ``?next=``) before letting them attach one of their families.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from accounts.notifications import display_name, frontend_url, send_template_email

if TYPE_CHECKING:
    from .models.contract import ContractInvitation


def send_contract_invitation_email(invitation: ContractInvitation) -> None:
    """Email the invitee a link to share the contract with one of their families."""
    nanny = invitation.contract.nanny
    send_template_email(
        template_key="contract_invitation",
        to=invitation.email,
        params={
            "inviter_name": display_name(invitation.invited_by),
            "nanny_first_name": nanny.first_name,
            "nanny_last_name": nanny.last_name,
            "accept_url": frontend_url(f"contract-invite/{invitation.token}"),
        },
    )
