import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Child, User

pytestmark = pytest.mark.django_db

VALID_PASSWORD = "sufficiently-long-pass-42"


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user():
    return User.objects.create_user(email="parent@example.com", password=VALID_PASSWORD)


@pytest.fixture
def other_user():
    return User.objects.create_user(email="stranger@example.com", password=VALID_PASSWORD)


def test_list_returns_only_own_children(client, user, other_user):
    Child.objects.create(parent=user, first_name="Mine")
    Child.objects.create(parent=other_user, first_name="Theirs")
    client.force_authenticate(user=user)

    resp = client.get(reverse("accounts:child-list"))

    assert resp.status_code == 200
    names = [c["first_name"] for c in resp.data]
    assert names == ["Mine"]


def test_create_child_assigns_current_user_as_parent(client, user):
    client.force_authenticate(user=user)

    resp = client.post(
        reverse("accounts:child-list"),
        {"first_name": "Leo"},
        format="json",
    )

    assert resp.status_code == 201
    assert resp.data["first_name"] == "Leo"
    child = Child.objects.get(id=resp.data["id"])
    assert child.parent == user


def test_update_child_renames(client, user):
    child = Child.objects.create(parent=user, first_name="Leo")
    client.force_authenticate(user=user)

    resp = client.patch(
        reverse("accounts:child-detail", args=[child.pk]),
        {"first_name": "Leon"},
        format="json",
    )

    assert resp.status_code == 200
    child.refresh_from_db()
    assert child.first_name == "Leon"


def test_delete_child_removes_it(client, user):
    child = Child.objects.create(parent=user, first_name="Leo")
    client.force_authenticate(user=user)

    resp = client.delete(reverse("accounts:child-detail", args=[child.pk]))

    assert resp.status_code == 204
    assert not Child.objects.filter(id=child.pk).exists()


def test_cannot_access_another_users_child(client, user, other_user):
    child = Child.objects.create(parent=other_user, first_name="Theirs")
    client.force_authenticate(user=user)

    assert client.get(reverse("accounts:child-detail", args=[child.pk])).status_code == 404
    assert (
        client.patch(
            reverse("accounts:child-detail", args=[child.pk]),
            {"first_name": "Hijack"},
            format="json",
        ).status_code
        == 404
    )
    assert client.delete(reverse("accounts:child-detail", args=[child.pk])).status_code == 404


def test_children_require_authentication(client):
    assert client.get(reverse("accounts:child-list")).status_code == 401
