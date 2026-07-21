"""Brevo-template selection for the family invitation email.

Mirrors tests/accounts/test_email.py (the auth emails): creating an invitation sends a
Brevo-hosted template picked by the request's active language, so we assert the outgoing
message's ``template_id`` and merge ``params`` rather than a rendered body. The
``mailoutbox`` fixture keeps the message objects for inspection.
"""

import pytest
from django.conf import settings
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Family, FamilyMembership, Invitation, User
from accounts.notifications import display_name

pytestmark = pytest.mark.django_db

VALID_PASSWORD = "sufficiently-long-pass-42"
IDS = settings.BREVO_TEMPLATE_IDS


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def manager():
    return User.objects.create_user(
        email="owner@example.com",
        password=VALID_PASSWORD,
        first_name="Ada",
        last_name="Lovelace",
    )


@pytest.fixture
def family(manager):
    fam = Family.objects.create(name="The Nest", created_by=manager)
    FamilyMembership.objects.create(family=fam, user=manager, role=FamilyMembership.Role.OWNER)
    return fam


def invite(client, family, lang=None, email="invitee@example.com"):
    headers = {"HTTP_ACCEPT_LANGUAGE": lang} if lang else {}
    url = reverse("accounts:family-invitations", args=[family.pk])
    return client.post(url, {"email": email}, format="json", **headers)


@pytest.mark.parametrize(
    "lang, expected",
    [
        ("fr", IDS["family_invitation"]["fr"]),
        ("en", IDS["family_invitation"]["en"]),
        # Unsupported / missing header resolves upstream to LANGUAGE_CODE ("en").
        ("de", IDS["family_invitation"]["en"]),
        (None, IDS["family_invitation"]["en"]),
    ],
)
def test_family_invitation_email_picks_template_by_language(
    client, manager, family, mailoutbox, lang, expected
):
    client.force_authenticate(user=manager)

    resp = invite(client, family, lang)
    assert resp.status_code == 201

    assert len(mailoutbox) == 1
    msg = mailoutbox[0]
    assert msg.template_id == expected
    assert msg.to == ["invitee@example.com"]
    params = msg.merge_global_data
    assert params["accept_url"] == f"https://mgs-dev.local/invite/{resp.data['token']}"
    assert params["family_name"] == "The Nest"
    assert params["inviter_name"] == "Ada Lovelace"
    assert params["site_name"] == "Ma Garde Sereine"
    # Role is the human label for the invited role (default: family member).
    assert params["role"]


def test_family_invitation_email_handles_nameless_inviter(client, family, mailoutbox):
    # An inviter with no first/last name yields an empty inviter_name (never the email).
    nameless = family.created_by
    nameless.first_name = ""
    nameless.last_name = ""
    nameless.save(update_fields=["first_name", "last_name"])
    client.force_authenticate(user=nameless)

    assert invite(client, family, "fr").status_code == 201

    assert mailoutbox[0].merge_global_data["inviter_name"] == ""


def test_display_name_is_empty_when_inviter_deleted():
    # invited_by is SET_NULL: an inviter who since deleted their account yields "".
    assert display_name(None) == ""


def test_invitation_rolls_back_when_email_delivery_fails(client, manager, family, monkeypatch):
    # A send failure must not leave a committed pending row — that would trip the
    # duplicate-pending guard and block the manager from re-inviting the same address.
    def boom(_invitation):
        raise RuntimeError("brevo down")

    monkeypatch.setattr("accounts.serializers.send_family_invitation_email", boom)
    client.force_authenticate(user=manager)
    client.raise_request_exception = False

    assert invite(client, family, "fr").status_code == 500
    assert Invitation.objects.count() == 0
