from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from contracts.models import ContractInvitation, ContractShare

pytestmark = pytest.mark.django_db


def invitations_url(family, contract):
    return reverse("contracts:contract-invitations", args=[family.id, contract.id])


def make_invitation(contract, owner, email="outsider@example.com", **overrides):
    return ContractInvitation.objects.create(
        contract=contract, email=email, invited_by=owner, **overrides
    )


def test_owner_creates_invitation(client, owner, family, contract):
    client.force_authenticate(user=owner)
    resp = client.post(
        invitations_url(family, contract), {"email": "friend@example.com"}, format="json"
    )
    assert resp.status_code == 201
    assert resp.data["token"]
    assert resp.data["status"] == "pending"


def test_member_cannot_create_invitation(client, member, family, contract):
    client.force_authenticate(user=member)
    resp = client.post(
        invitations_url(family, contract), {"email": "friend@example.com"}, format="json"
    )
    assert resp.status_code == 403


def test_duplicate_pending_invitation_rejected(client, owner, family, contract):
    client.force_authenticate(user=owner)
    client.post(invitations_url(family, contract), {"email": "friend@example.com"}, format="json")
    resp = client.post(
        invitations_url(family, contract), {"email": "friend@example.com"}, format="json"
    )
    assert resp.status_code == 400


def test_preview_is_public_and_hides_token(client, owner, contract):
    invitation = make_invitation(contract, owner)
    url = reverse("contracts:contract-invitation-preview", args=[invitation.token])

    resp = client.get(url)  # unauthenticated

    assert resp.status_code == 200
    assert resp.data["nanny_first_name"] == "Marie"
    assert "token" not in resp.data


def test_accept_attaches_chosen_family(client, owner, outsider, other_family, contract):
    invitation = make_invitation(contract, owner, email=outsider.email)
    client.force_authenticate(user=outsider)
    url = reverse("contracts:contract-invitation-accept", args=[invitation.token])

    resp = client.post(url, {"family_id": other_family.id}, format="json")

    assert resp.status_code == 200
    assert ContractShare.objects.filter(contract=contract, family=other_family).exists()
    invitation.refresh_from_db()
    assert invitation.status == ContractInvitation.Status.ACCEPTED


def test_accept_requires_a_family_the_user_owns(client, owner, outsider, family, contract):
    invitation = make_invitation(contract, owner, email=outsider.email)
    client.force_authenticate(user=outsider)
    url = reverse("contracts:contract-invitation-accept", args=[invitation.token])

    # `family` is owned by `owner`, not `outsider`.
    resp = client.post(url, {"family_id": family.id}, format="json")

    assert resp.status_code == 403


def test_accept_requires_family_id(client, owner, outsider, contract):
    invitation = make_invitation(contract, owner, email=outsider.email)
    client.force_authenticate(user=outsider)
    url = reverse("contracts:contract-invitation-accept", args=[invitation.token])

    resp = client.post(url, {}, format="json")

    assert resp.status_code == 400


def test_decline(client, owner, outsider, contract):
    invitation = make_invitation(contract, owner, email=outsider.email)
    client.force_authenticate(user=outsider)
    url = reverse("contracts:contract-invitation-decline", args=[invitation.token])

    resp = client.post(url)

    assert resp.status_code == 204
    invitation.refresh_from_db()
    assert invitation.status == ContractInvitation.Status.DECLINED


def test_revoke_keeps_audit_trail(client, owner, family, contract):
    invitation = make_invitation(contract, owner)
    client.force_authenticate(user=owner)
    url = reverse("contracts:contract-invitation", args=[family.id, contract.id, invitation.id])

    resp = client.delete(url)

    assert resp.status_code == 204
    invitation.refresh_from_db()
    assert invitation.status == ContractInvitation.Status.REVOKED


def test_my_invitations_inbox(client, owner, outsider, contract):
    make_invitation(contract, owner, email=outsider.email)
    client.force_authenticate(user=outsider)

    resp = client.get(reverse("contracts:my-contract-invitations"))

    assert resp.status_code == 200
    assert len(resp.data) == 1
    assert resp.data[0]["nanny_first_name"] == "Marie"


def test_expired_invitation_is_not_actionable(client, owner, outsider, contract):
    invitation = make_invitation(
        contract, owner, email=outsider.email, expires_at=timezone.now() - timedelta(days=1)
    )
    client.force_authenticate(user=outsider)
    url = reverse("contracts:contract-invitation-accept", args=[invitation.token])

    resp = client.post(url, {"family_id": 999}, format="json")

    assert resp.status_code == 400
