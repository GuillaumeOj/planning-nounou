"""Bilingual Brevo-template selection for the djoser auth emails.

Every auth email is a Brevo-hosted template picked by the request's active language
(fr/en, fr fallback via LocaleMiddleware + Accept-Language). We don't render bodies
locally, so instead of asserting HTML we assert each outgoing message carries the right
``template_id`` and merge ``params`` — Anymail's Brevo backend turns those into the send.
The ``mailoutbox`` fixture keeps the message objects, so those attributes are inspectable.
"""

import pytest
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from djoser.utils import encode_uid
from rest_framework.test import APIClient

from accounts.models import User

pytestmark = pytest.mark.django_db

VALID_PASSWORD = "sufficiently-long-pass-42"
NEW_PASSWORD = "another-long-pass-77"

REGISTER = "/api/auth/users/"
ACTIVATION = "/api/auth/users/activation/"
RESET_PASSWORD = "/api/auth/users/reset_password/"
SET_PASSWORD = "/api/auth/users/set_password/"
SET_EMAIL = "/api/auth/users/set_email/"

IDS = settings.BREVO_TEMPLATE_IDS


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user():
    return User.objects.create_user(
        email="existing@example.com", password=VALID_PASSWORD, first_name="Ada"
    )


def register(client, lang=None, email="new@example.com", first_name="Nan"):
    headers = {"HTTP_ACCEPT_LANGUAGE": lang} if lang else {}
    body = {"email": email, "password": VALID_PASSWORD}
    if first_name is not None:
        body["first_name"] = first_name
    return client.post(REGISTER, body, format="json", **headers)


def activate(client, created, lang=None):
    headers = {"HTTP_ACCEPT_LANGUAGE": lang} if lang else {}
    payload = {"uid": encode_uid(created.pk), "token": default_token_generator.make_token(created)}
    return client.post(ACTIVATION, payload, format="json", **headers)


# --- Activation -------------------------------------------------------------


@pytest.mark.parametrize(
    "lang, expected",
    [
        ("fr", IDS["activation"]["fr"]),
        ("en", IDS["activation"]["en"]),
        # Unsupported / missing Accept-Language: LocaleMiddleware resolves to
        # LANGUAGE_CODE ("en"), so we send the English template. The SPA always sends
        # an explicit fr/en header, so this only affects non-SPA sends.
        ("de", IDS["activation"]["en"]),
        (None, IDS["activation"]["en"]),
    ],
)
def test_activation_email_picks_template_by_language(client, mailoutbox, lang, expected):
    assert register(client, lang).status_code == 201

    assert len(mailoutbox) == 1
    msg = mailoutbox[0]
    assert msg.template_id == expected
    assert msg.to == ["new@example.com"]
    params = msg.merge_global_data
    assert params["activation_url"].startswith("https://mgs-dev.local/activate/")
    assert params["first_name"] == "Nan"
    assert params["site_name"] == "Ma Garde Sereine"


def test_activation_email_handles_missing_first_name(client, mailoutbox):
    assert register(client, "fr", email="nofn@example.com", first_name=None).status_code == 201

    assert mailoutbox[0].merge_global_data["first_name"] == ""


# --- Confirmation (welcome, on activation) ----------------------------------


def test_confirmation_email_sent_on_activation_in_request_language(client, mailoutbox):
    register(client, "en")
    created = User.objects.get(email="new@example.com")
    mailoutbox.clear()

    assert activate(client, created, "en").status_code == 204

    assert len(mailoutbox) == 1
    msg = mailoutbox[0]
    assert msg.template_id == IDS["confirmation"]["en"]
    assert msg.merge_global_data["login_url"] == "https://mgs-dev.local/login"
    assert msg.merge_global_data["site_name"] == "Ma Garde Sereine"


# --- Password reset ---------------------------------------------------------


def test_password_reset_email_picks_template_by_language(client, user, mailoutbox):
    resp = client.post(
        RESET_PASSWORD, {"email": user.email}, format="json", HTTP_ACCEPT_LANGUAGE="fr"
    )

    assert resp.status_code == 204
    assert len(mailoutbox) == 1
    msg = mailoutbox[0]
    assert msg.template_id == IDS["password_reset"]["fr"]
    assert "reset-password/" in msg.merge_global_data["reset_url"]
    assert msg.merge_global_data["reset_url"].startswith("https://mgs-dev.local/")
    assert msg.merge_global_data["first_name"] == "Ada"


# --- Password changed confirmation (on set_password) ------------------------


def test_password_changed_confirmation_email_is_sent(client, user, mailoutbox):
    client.force_authenticate(user=user)

    resp = client.post(
        SET_PASSWORD,
        {"current_password": VALID_PASSWORD, "new_password": NEW_PASSWORD},
        format="json",
        HTTP_ACCEPT_LANGUAGE="en",
    )

    assert resp.status_code == 204
    assert len(mailoutbox) == 1
    msg = mailoutbox[0]
    assert msg.template_id == IDS["password_changed_confirmation"]["en"]
    assert msg.merge_global_data == {"first_name": "Ada", "site_name": "Ma Garde Sereine"}


# --- Email changed confirmation (on set_email; djoser "username changed") ----


def test_email_changed_confirmation_email_is_sent(client, user, mailoutbox):
    client.force_authenticate(user=user)

    resp = client.post(
        SET_EMAIL,
        {"current_password": VALID_PASSWORD, "new_email": "renamed@example.com"},
        format="json",
        HTTP_ACCEPT_LANGUAGE="fr",
    )

    assert resp.status_code == 204
    assert len(mailoutbox) == 1
    msg = mailoutbox[0]
    assert msg.template_id == IDS["email_changed_confirmation"]["fr"]
    assert msg.merge_global_data["site_name"] == "Ma Garde Sereine"
