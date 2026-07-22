"""Brevo-template selection for the contract-share invitation email.

Same shape as tests/accounts/test_invitation_email.py: creating a contract invitation
sends a Brevo-hosted template picked by the request's active language, so we assert the
outgoing message's ``template_id`` and merge ``params``. Fixtures come from the shared
conftest (``owner``/``family``/``contract`` — the nanny is "Marie Dupont").
"""

import pytest
from django.conf import settings
from django.urls import reverse

from contracts.models import ContractInvitation

pytestmark = pytest.mark.django_db

IDS = settings.BREVO_TEMPLATE_IDS


def invite(client, family, contract, lang=None, email="invitee@example.com"):
    headers = {"HTTP_ACCEPT_LANGUAGE": lang} if lang else {}
    url = reverse("contracts:contract-invitations", args=[family.id, contract.id])
    return client.post(url, {"email": email}, format="json", **headers)


@pytest.mark.parametrize(
    "lang, expected",
    [
        ("fr", IDS["contract_invitation"]["fr"]),
        ("en", IDS["contract_invitation"]["en"]),
        # Unsupported / missing header resolves upstream to LANGUAGE_CODE ("en").
        ("de", IDS["contract_invitation"]["en"]),
        (None, IDS["contract_invitation"]["en"]),
    ],
)
def test_contract_invitation_email_picks_template_by_language(
    client, owner, family, contract, mailoutbox, lang, expected
):
    client.force_authenticate(user=owner)

    resp = invite(client, family, contract, lang)
    assert resp.status_code == 201

    assert len(mailoutbox) == 1
    msg = mailoutbox[0]
    assert msg.template_id == expected
    assert msg.to == ["invitee@example.com"]
    params = msg.merge_global_data
    # Token-addressed link the new /contract-invite/:token SPA page handles.
    assert params["accept_url"] == f"https://mgs-dev.local/contract-invite/{resp.data['token']}"
    assert params["nanny_first_name"] == "Marie"
    assert params["nanny_last_name"] == "Dupont"
    assert params["site_name"] == "Ma Garde Sereine"


def test_contract_invitation_rolls_back_when_email_delivery_fails(
    client, owner, family, contract, monkeypatch
):
    # A send failure must not leave a committed pending row (the duplicate-pending
    # guard would then block re-inviting the same address).
    def boom(_invitation):
        raise RuntimeError("brevo down")

    monkeypatch.setattr("contracts.serializers.send_contract_invitation_email", boom)
    client.force_authenticate(user=owner)
    client.raise_request_exception = False

    assert invite(client, family, contract, "fr").status_code == 500
    assert ContractInvitation.objects.count() == 0
