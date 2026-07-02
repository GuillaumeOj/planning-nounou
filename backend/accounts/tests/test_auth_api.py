import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User

pytestmark = pytest.mark.django_db

VALID_PASSWORD = "sufficiently-long-pass-42"


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user():
    return User.objects.create_user(email="existing@example.com", password=VALID_PASSWORD)


# --- Register ---------------------------------------------------------------


def test_register_creates_user(client):
    resp = client.post(
        reverse("accounts:register"),
        {"email": "new@example.com", "password": VALID_PASSWORD, "first_name": "Nan"},
        format="json",
    )

    assert resp.status_code == 201
    assert resp.data["email"] == "new@example.com"
    assert resp.data["first_name"] == "Nan"
    assert "password" not in resp.data

    created = User.objects.get(email="new@example.com")
    assert created.check_password(VALID_PASSWORD)


def test_register_rejects_duplicate_email(client, user):
    resp = client.post(
        reverse("accounts:register"),
        {"email": "existing@example.com", "password": VALID_PASSWORD},
        format="json",
    )

    assert resp.status_code == 400
    assert resp.data["email"][0] == "A user with this email already exists."


def test_register_error_is_localized_to_french(client, user):
    resp = client.post(
        reverse("accounts:register"),
        {"email": "existing@example.com", "password": VALID_PASSWORD},
        format="json",
        HTTP_ACCEPT_LANGUAGE="fr",
    )

    assert resp.status_code == 400
    assert resp.data["email"][0] == "Un utilisateur avec cette adresse e-mail existe déjà."


def test_register_error_defaults_to_english(client, user):
    resp = client.post(
        reverse("accounts:register"),
        {"email": "existing@example.com", "password": VALID_PASSWORD},
        format="json",
        HTTP_ACCEPT_LANGUAGE="de",  # unsupported language falls back to English
    )

    assert resp.status_code == 400
    assert resp.data["email"][0] == "A user with this email already exists."


def test_register_rejects_weak_password(client):
    resp = client.post(
        reverse("accounts:register"),
        {"email": "weak@example.com", "password": "123"},
        format="json",
    )

    assert resp.status_code == 400
    assert "password" in resp.data


def test_register_requires_email_and_password(client):
    resp = client.post(reverse("accounts:register"), {}, format="json")

    assert resp.status_code == 400
    assert "email" in resp.data
    assert "password" in resp.data


# --- Login / refresh --------------------------------------------------------


def test_login_returns_tokens(client, user):
    resp = client.post(
        reverse("accounts:login"),
        {"email": "existing@example.com", "password": VALID_PASSWORD},
        format="json",
    )

    assert resp.status_code == 200
    assert "access" in resp.data
    assert "refresh" in resp.data


def test_login_rejects_wrong_password(client, user):
    resp = client.post(
        reverse("accounts:login"),
        {"email": "existing@example.com", "password": "wrong-password-99"},
        format="json",
    )

    assert resp.status_code == 401


def test_refresh_returns_new_access(client, user):
    login = client.post(
        reverse("accounts:login"),
        {"email": "existing@example.com", "password": VALID_PASSWORD},
        format="json",
    )
    refresh = login.data["refresh"]

    resp = client.post(
        reverse("accounts:token-refresh"),
        {"refresh": refresh},
        format="json",
    )

    assert resp.status_code == 200
    assert "access" in resp.data


# --- Me ---------------------------------------------------------------------


def test_me_returns_current_user(client, user):
    client.force_authenticate(user=user)

    resp = client.get(reverse("accounts:me"))

    assert resp.status_code == 200
    assert resp.data["email"] == "existing@example.com"


def test_me_requires_authentication(client):
    resp = client.get(reverse("accounts:me"))

    assert resp.status_code == 401


def test_me_accepts_bearer_token(client, user):
    login = client.post(
        reverse("accounts:login"),
        {"email": "existing@example.com", "password": VALID_PASSWORD},
        format="json",
    )
    access = login.data["access"]

    resp = client.get(reverse("accounts:me"), HTTP_AUTHORIZATION=f"Bearer {access}")

    assert resp.status_code == 200
    assert resp.data["email"] == "existing@example.com"


# --- Update profile (names) -------------------------------------------------


def test_me_patch_updates_names(client, user):
    client.force_authenticate(user=user)

    resp = client.patch(
        reverse("accounts:me"),
        {"first_name": "Ada", "last_name": "Lovelace"},
        format="json",
    )

    assert resp.status_code == 200
    assert resp.data["first_name"] == "Ada"
    assert resp.data["last_name"] == "Lovelace"
    user.refresh_from_db()
    assert user.first_name == "Ada"
    assert user.last_name == "Lovelace"


def test_me_patch_cannot_change_email(client, user):
    client.force_authenticate(user=user)

    resp = client.patch(
        reverse("accounts:me"),
        {"email": "hijack@example.com"},
        format="json",
    )

    assert resp.status_code == 200
    user.refresh_from_db()
    # Email is read-only on the profile endpoint; it is unchanged.
    assert user.email == "existing@example.com"


def test_me_patch_requires_authentication(client):
    resp = client.patch(reverse("accounts:me"), {"first_name": "Ada"}, format="json")

    assert resp.status_code == 401


# --- Change email -----------------------------------------------------------


def test_change_email_succeeds_with_correct_password(client, user):
    client.force_authenticate(user=user)

    resp = client.put(
        reverse("accounts:change-email"),
        {"current_password": VALID_PASSWORD, "email": "renamed@example.com"},
        format="json",
    )

    assert resp.status_code == 200
    assert resp.data["email"] == "renamed@example.com"
    user.refresh_from_db()
    assert user.email == "renamed@example.com"


def test_change_email_rejects_wrong_password(client, user):
    client.force_authenticate(user=user)

    resp = client.put(
        reverse("accounts:change-email"),
        {"current_password": "wrong-password-99", "email": "renamed@example.com"},
        format="json",
    )

    assert resp.status_code == 400
    assert "current_password" in resp.data
    user.refresh_from_db()
    assert user.email == "existing@example.com"


def test_change_email_rejects_duplicate(client, user):
    User.objects.create_user(email="taken@example.com", password=VALID_PASSWORD)
    client.force_authenticate(user=user)

    resp = client.put(
        reverse("accounts:change-email"),
        {"current_password": VALID_PASSWORD, "email": "taken@example.com"},
        format="json",
    )

    assert resp.status_code == 400
    assert resp.data["email"][0] == "A user with this email already exists."


def test_change_email_requires_authentication(client):
    resp = client.put(
        reverse("accounts:change-email"),
        {"current_password": VALID_PASSWORD, "email": "renamed@example.com"},
        format="json",
    )

    assert resp.status_code == 401


# --- Change password --------------------------------------------------------


def test_change_password_succeeds_with_correct_current(client, user):
    client.force_authenticate(user=user)
    new_password = "another-long-pass-77"

    resp = client.put(
        reverse("accounts:change-password"),
        {"current_password": VALID_PASSWORD, "new_password": new_password},
        format="json",
    )

    assert resp.status_code == 204
    user.refresh_from_db()
    assert user.check_password(new_password)


def test_change_password_rejects_wrong_current(client, user):
    client.force_authenticate(user=user)

    resp = client.put(
        reverse("accounts:change-password"),
        {"current_password": "wrong-password-99", "new_password": "another-long-pass-77"},
        format="json",
    )

    assert resp.status_code == 400
    assert "current_password" in resp.data
    user.refresh_from_db()
    assert user.check_password(VALID_PASSWORD)


def test_change_password_rejects_weak_new(client, user):
    client.force_authenticate(user=user)

    resp = client.put(
        reverse("accounts:change-password"),
        {"current_password": VALID_PASSWORD, "new_password": "123"},
        format="json",
    )

    assert resp.status_code == 400
    assert "new_password" in resp.data


def test_change_password_requires_authentication(client):
    resp = client.put(
        reverse("accounts:change-password"),
        {"current_password": VALID_PASSWORD, "new_password": "another-long-pass-77"},
        format="json",
    )

    assert resp.status_code == 401
