import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import User
from tracking.models import Nanny

pytestmark = pytest.mark.django_db

PASSWORD = "sufficiently-long-pass-42"


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user():
    return User.objects.create_user(email="owner@example.com", password=PASSWORD)


@pytest.fixture
def other_user():
    return User.objects.create_user(email="other@example.com", password=PASSWORD)


def make_nanny(owner, **overrides):
    data = {
        "first_name": "Marie",
        "last_name": "Dupont",
        "starting_date": "2026-01-05",
        "ending_date": None,
    }
    data.update(overrides)
    return Nanny.objects.create(owner=owner, **data)


# --- Create -----------------------------------------------------------------


def test_create_nanny(client, user):
    client.force_authenticate(user=user)

    resp = client.post(
        reverse("tracking:nanny-list"),
        {"first_name": "Marie", "last_name": "Dupont", "starting_date": "2026-01-05"},
        format="json",
    )

    assert resp.status_code == 201
    assert resp.data["first_name"] == "Marie"
    assert resp.data["ending_date"] is None
    nanny = Nanny.objects.get(id=resp.data["id"])
    assert nanny.owner == user


def test_create_nanny_with_ending_date(client, user):
    client.force_authenticate(user=user)

    resp = client.post(
        reverse("tracking:nanny-list"),
        {
            "first_name": "Paul",
            "last_name": "Martin",
            "starting_date": "2025-03-01",
            "ending_date": "2026-06-30",
        },
        format="json",
    )

    assert resp.status_code == 201
    assert resp.data["ending_date"] == "2026-06-30"


def test_create_rejects_ending_before_starting(client, user):
    client.force_authenticate(user=user)

    resp = client.post(
        reverse("tracking:nanny-list"),
        {
            "first_name": "Paul",
            "last_name": "Martin",
            "starting_date": "2026-06-30",
            "ending_date": "2025-03-01",
        },
        format="json",
    )

    assert resp.status_code == 400
    assert "ending_date" in resp.data


def test_create_error_is_localized_to_french(client, user):
    client.force_authenticate(user=user)

    resp = client.post(
        reverse("tracking:nanny-list"),
        {
            "first_name": "Paul",
            "last_name": "Martin",
            "starting_date": "2026-06-30",
            "ending_date": "2025-03-01",
        },
        format="json",
        HTTP_ACCEPT_LANGUAGE="fr",
    )

    assert resp.status_code == 400
    assert resp.data["ending_date"][0] == (
        "La date de fin ne peut pas être antérieure à la date de début."
    )


def test_create_requires_authentication(client):
    resp = client.post(
        reverse("tracking:nanny-list"),
        {"first_name": "Marie", "last_name": "Dupont", "starting_date": "2026-01-05"},
        format="json",
    )

    assert resp.status_code == 401


# --- List -------------------------------------------------------------------


def test_list_returns_only_own_nannies(client, user, other_user):
    make_nanny(user, first_name="Mine")
    make_nanny(other_user, first_name="Theirs")
    client.force_authenticate(user=user)

    resp = client.get(reverse("tracking:nanny-list"))

    assert resp.status_code == 200
    assert [n["first_name"] for n in resp.data] == ["Mine"]


# --- Retrieve / update / delete ---------------------------------------------


def test_retrieve_own_nanny(client, user):
    nanny = make_nanny(user)
    client.force_authenticate(user=user)

    resp = client.get(reverse("tracking:nanny-detail", args=[nanny.id]))

    assert resp.status_code == 200
    assert resp.data["id"] == nanny.id


def test_update_own_nanny(client, user):
    nanny = make_nanny(user)
    client.force_authenticate(user=user)

    resp = client.patch(
        reverse("tracking:nanny-detail", args=[nanny.id]),
        {"ending_date": "2026-12-31"},
        format="json",
    )

    assert resp.status_code == 200
    nanny.refresh_from_db()
    assert nanny.ending_date.isoformat() == "2026-12-31"


def test_update_rejects_ending_before_existing_starting(client, user):
    nanny = make_nanny(user, starting_date="2026-01-05")
    client.force_authenticate(user=user)

    resp = client.patch(
        reverse("tracking:nanny-detail", args=[nanny.id]),
        {"ending_date": "2025-01-01"},
        format="json",
    )

    assert resp.status_code == 400
    assert "ending_date" in resp.data


def test_delete_own_nanny(client, user):
    nanny = make_nanny(user)
    client.force_authenticate(user=user)

    resp = client.delete(reverse("tracking:nanny-detail", args=[nanny.id]))

    assert resp.status_code == 204
    assert not Nanny.objects.filter(id=nanny.id).exists()


def test_cannot_access_other_users_nanny(client, user, other_user):
    nanny = make_nanny(other_user)
    client.force_authenticate(user=user)

    assert client.get(reverse("tracking:nanny-detail", args=[nanny.id])).status_code == 404
    assert (
        client.patch(
            reverse("tracking:nanny-detail", args=[nanny.id]),
            {"first_name": "Hacked"},
            format="json",
        ).status_code
        == 404
    )
    assert client.delete(reverse("tracking:nanny-detail", args=[nanny.id])).status_code == 404
