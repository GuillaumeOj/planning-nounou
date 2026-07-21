"""Auth API contract, now served by djoser + SimpleJWT.

Endpoints (all under /api/auth/):
    POST users/                     register (accepts invitation_token)
    POST users/activation/          verify email
    POST users/resend_activation/
    POST users/reset_password/  + reset_password_confirm/
    GET/PATCH users/me/             current user
    POST users/set_email/           change email    (current_password guard)
    POST users/set_password/        change password (current_password guard)
    POST jwt/create/  refresh/  blacklist/
"""

import pytest
from django.contrib.auth.tokens import default_token_generator
from djoser.utils import encode_uid
from rest_framework.test import APIClient

from accounts.models import User

pytestmark = pytest.mark.django_db

VALID_PASSWORD = "sufficiently-long-pass-42"

REGISTER = "/api/auth/users/"
ACTIVATION = "/api/auth/users/activation/"
RESEND_ACTIVATION = "/api/auth/users/resend_activation/"
RESET_PASSWORD = "/api/auth/users/reset_password/"
RESET_PASSWORD_CONFIRM = "/api/auth/users/reset_password_confirm/"
ME = "/api/auth/users/me/"
SET_EMAIL = "/api/auth/users/set_email/"
SET_PASSWORD = "/api/auth/users/set_password/"
LOGIN = "/api/auth/jwt/create/"
REFRESH = "/api/auth/jwt/refresh/"
BLACKLIST = "/api/auth/jwt/blacklist/"


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user():
    """An active (already-verified) account."""
    return User.objects.create_user(email="existing@example.com", password=VALID_PASSWORD)


def login(client, email="existing@example.com", password=VALID_PASSWORD):
    return client.post(LOGIN, {"email": email, "password": password}, format="json")


# --- Register (email verification: new users are inactive) ------------------


def test_register_creates_inactive_user(client, mailoutbox):
    resp = client.post(
        REGISTER,
        {"email": "new@example.com", "password": VALID_PASSWORD, "first_name": "Nan"},
        format="json",
    )

    assert resp.status_code == 201
    assert resp.data["email"] == "new@example.com"
    assert resp.data["first_name"] == "Nan"
    assert "password" not in resp.data

    created = User.objects.get(email="new@example.com")
    assert created.check_password(VALID_PASSWORD)
    # Verification required before the account can log in.
    assert created.is_active is False
    # An activation email went out.
    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ["new@example.com"]


def test_register_rejects_duplicate_email(client, user):
    resp = client.post(
        REGISTER,
        {"email": "existing@example.com", "password": VALID_PASSWORD},
        format="json",
    )

    assert resp.status_code == 400
    assert resp.data["email"][0] == "A user with this email already exists."


def test_register_rejects_duplicate_email_case_insensitively(client, user):
    resp = client.post(
        REGISTER,
        {"email": "EXISTING@example.com", "password": VALID_PASSWORD},
        format="json",
    )

    assert resp.status_code == 400
    assert resp.data["email"][0] == "A user with this email already exists."


def test_register_error_is_localized_to_french(client, user):
    resp = client.post(
        REGISTER,
        {"email": "existing@example.com", "password": VALID_PASSWORD},
        format="json",
        HTTP_ACCEPT_LANGUAGE="fr",
    )

    assert resp.status_code == 400
    assert resp.data["email"][0] == "Un utilisateur avec cette adresse e-mail existe déjà."


def test_register_error_defaults_to_english(client, user):
    resp = client.post(
        REGISTER,
        {"email": "existing@example.com", "password": VALID_PASSWORD},
        format="json",
        HTTP_ACCEPT_LANGUAGE="de",  # unsupported language falls back to English
    )

    assert resp.status_code == 400
    assert resp.data["email"][0] == "A user with this email already exists."


def test_register_rejects_weak_password(client):
    resp = client.post(
        REGISTER,
        {"email": "weak@example.com", "password": "123"},
        format="json",
    )

    assert resp.status_code == 400
    assert "password" in resp.data


def test_register_requires_email_and_password(client):
    resp = client.post(REGISTER, {}, format="json")

    assert resp.status_code == 400
    assert "email" in resp.data
    assert "password" in resp.data


# --- Activation / resend ----------------------------------------------------


def activation_payload(user: User) -> dict:
    return {"uid": encode_uid(user.pk), "token": default_token_generator.make_token(user)}


def test_activation_activates_and_enables_login(client):
    client.post(
        REGISTER,
        {"email": "new@example.com", "password": VALID_PASSWORD},
        format="json",
    )
    created = User.objects.get(email="new@example.com")
    # Inactive account can't log in yet.
    assert login(client, "new@example.com").status_code == 401

    resp = client.post(ACTIVATION, activation_payload(created), format="json")
    assert resp.status_code == 204

    created.refresh_from_db()
    assert created.is_active is True
    assert login(client, "new@example.com").status_code == 200


def test_activation_rejects_bad_token(client):
    client.post(REGISTER, {"email": "new@example.com", "password": VALID_PASSWORD}, format="json")
    created = User.objects.get(email="new@example.com")

    resp = client.post(
        ACTIVATION, {"uid": encode_uid(created.pk), "token": "not-a-token"}, format="json"
    )
    assert resp.status_code == 400
    created.refresh_from_db()
    assert created.is_active is False


def test_resend_activation_sends_email(client, mailoutbox):
    client.post(REGISTER, {"email": "new@example.com", "password": VALID_PASSWORD}, format="json")
    mailoutbox.clear()

    resp = client.post(RESEND_ACTIVATION, {"email": "new@example.com"}, format="json")

    assert resp.status_code == 204
    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ["new@example.com"]


# --- Login / refresh / logout -----------------------------------------------


def test_login_returns_tokens(client, user):
    resp = login(client)

    assert resp.status_code == 200
    assert "access" in resp.data
    assert "refresh" in resp.data


def test_login_rejects_wrong_password(client, user):
    resp = login(client, password="wrong-password-99")

    assert resp.status_code == 401


def test_refresh_returns_new_access(client, user):
    refresh = login(client).data["refresh"]

    resp = client.post(REFRESH, {"refresh": refresh}, format="json")

    assert resp.status_code == 200
    assert "access" in resp.data


def test_logout_blacklists_refresh_token(client, user):
    refresh = login(client).data["refresh"]

    logout = client.post(BLACKLIST, {"refresh": refresh}, format="json")
    assert logout.status_code == 200

    # A blacklisted refresh token can no longer mint access tokens.
    resp = client.post(REFRESH, {"refresh": refresh}, format="json")
    assert resp.status_code == 401


# --- Me ---------------------------------------------------------------------


def test_me_returns_current_user(client, user):
    client.force_authenticate(user=user)

    resp = client.get(ME)

    assert resp.status_code == 200
    assert resp.data["email"] == "existing@example.com"


def test_me_requires_authentication(client):
    resp = client.get(ME)

    assert resp.status_code == 401


def test_me_accepts_bearer_token(client, user):
    access = login(client).data["access"]

    resp = client.get(ME, HTTP_AUTHORIZATION=f"Bearer {access}")

    assert resp.status_code == 200
    assert resp.data["email"] == "existing@example.com"


def test_me_patch_updates_names(client, user):
    client.force_authenticate(user=user)

    resp = client.patch(ME, {"first_name": "Ada", "last_name": "Lovelace"}, format="json")

    assert resp.status_code == 200
    assert resp.data["first_name"] == "Ada"
    assert resp.data["last_name"] == "Lovelace"
    user.refresh_from_db()
    assert user.first_name == "Ada"
    assert user.last_name == "Lovelace"


def test_me_patch_cannot_change_email(client, user):
    client.force_authenticate(user=user)

    resp = client.patch(ME, {"email": "hijack@example.com"}, format="json")

    assert resp.status_code == 200
    user.refresh_from_db()
    # Email is read-only on the profile endpoint; change it via set_email.
    assert user.email == "existing@example.com"


def test_me_patch_requires_authentication(client):
    resp = client.patch(ME, {"first_name": "Ada"}, format="json")

    assert resp.status_code == 401


# --- Change email (set_email, guarded by current_password) ------------------


def test_change_email_succeeds_with_correct_password(client, user):
    client.force_authenticate(user=user)

    resp = client.post(
        SET_EMAIL,
        {"current_password": VALID_PASSWORD, "new_email": "renamed@example.com"},
        format="json",
    )

    assert resp.status_code == 204
    user.refresh_from_db()
    assert user.email == "renamed@example.com"


def test_change_email_rejects_wrong_password(client, user):
    client.force_authenticate(user=user)

    resp = client.post(
        SET_EMAIL,
        {"current_password": "wrong-password-99", "new_email": "renamed@example.com"},
        format="json",
    )

    assert resp.status_code == 400
    assert "current_password" in resp.data
    user.refresh_from_db()
    assert user.email == "existing@example.com"


def test_change_email_rejects_duplicate(client, user):
    User.objects.create_user(email="taken@example.com", password=VALID_PASSWORD)
    client.force_authenticate(user=user)

    resp = client.post(
        SET_EMAIL,
        {"current_password": VALID_PASSWORD, "new_email": "TAKEN@example.com"},
        format="json",
    )

    assert resp.status_code == 400
    assert resp.data["new_email"][0] == "A user with this email already exists."


def test_change_email_requires_authentication(client):
    resp = client.post(
        SET_EMAIL,
        {"current_password": VALID_PASSWORD, "new_email": "renamed@example.com"},
        format="json",
    )

    assert resp.status_code == 401


# --- Change password (set_password, guarded by current_password) ------------


def test_change_password_succeeds_with_correct_current(client, user):
    client.force_authenticate(user=user)
    new_password = "another-long-pass-77"

    resp = client.post(
        SET_PASSWORD,
        {"current_password": VALID_PASSWORD, "new_password": new_password},
        format="json",
    )

    assert resp.status_code == 204
    user.refresh_from_db()
    assert user.check_password(new_password)


def test_change_password_rejects_wrong_current(client, user):
    client.force_authenticate(user=user)

    resp = client.post(
        SET_PASSWORD,
        {"current_password": "wrong-password-99", "new_password": "another-long-pass-77"},
        format="json",
    )

    assert resp.status_code == 400
    assert "current_password" in resp.data
    user.refresh_from_db()
    assert user.check_password(VALID_PASSWORD)


def test_change_password_rejects_weak_new(client, user):
    client.force_authenticate(user=user)

    resp = client.post(
        SET_PASSWORD,
        {"current_password": VALID_PASSWORD, "new_password": "123"},
        format="json",
    )

    assert resp.status_code == 400
    assert "new_password" in resp.data


def test_change_password_requires_authentication(client):
    resp = client.post(
        SET_PASSWORD,
        {"current_password": VALID_PASSWORD, "new_password": "another-long-pass-77"},
        format="json",
    )

    assert resp.status_code == 401


# --- Password reset (forgot password) ---------------------------------------


def test_reset_password_sends_email(client, user, mailoutbox):
    resp = client.post(RESET_PASSWORD, {"email": "existing@example.com"}, format="json")

    assert resp.status_code == 204
    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ["existing@example.com"]


def test_reset_password_hides_unknown_email(client, mailoutbox):
    # No enumeration: unknown addresses still return 204 and send nothing.
    resp = client.post(RESET_PASSWORD, {"email": "nobody@example.com"}, format="json")

    assert resp.status_code == 204
    assert len(mailoutbox) == 0


def test_reset_password_confirm_sets_new_password(client, user):
    new_password = "brand-new-pass-88"
    payload = {
        "uid": encode_uid(user.pk),
        "token": default_token_generator.make_token(user),
        "new_password": new_password,
    }

    resp = client.post(RESET_PASSWORD_CONFIRM, payload, format="json")

    assert resp.status_code == 204
    user.refresh_from_db()
    assert user.check_password(new_password)
    assert login(client, password=new_password).status_code == 200


def test_reset_password_confirm_rejects_bad_token(client, user):
    payload = {
        "uid": encode_uid(user.pk),
        "token": "not-a-token",
        "new_password": "brand-new-pass-88",
    }

    resp = client.post(RESET_PASSWORD_CONFIRM, payload, format="json")

    assert resp.status_code == 400
    user.refresh_from_db()
    assert user.check_password(VALID_PASSWORD)


# --- djoser's username-reset routes are locked off (email changes go via set_email)


def test_username_reset_endpoint_is_not_public(client, user):
    # djoser mounts /users/reset_email/ from the same viewset; it must not be a
    # public path (and must not 500 on a missing USERNAME_RESET_CONFIRM_URL).
    resp = client.post(
        "/api/auth/users/reset_email/", {"email": "existing@example.com"}, format="json"
    )

    assert resp.status_code in (401, 403)
