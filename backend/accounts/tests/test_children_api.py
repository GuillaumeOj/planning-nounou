import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Child, Family, FamilyMembership, User

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


@pytest.fixture
def family(user):
    fam = Family.objects.create(name="Home", created_by=user)
    FamilyMembership.objects.create(family=fam, user=user, role=FamilyMembership.Role.OWNER)
    return fam


@pytest.fixture
def other_family(other_user):
    fam = Family.objects.create(name="Their Home", created_by=other_user)
    FamilyMembership.objects.create(family=fam, user=other_user, role=FamilyMembership.Role.OWNER)
    return fam


def test_list_returns_only_family_children(client, user, family, other_family):
    Child.objects.create(family=family, first_name="Mine")
    Child.objects.create(family=other_family, first_name="Theirs")
    client.force_authenticate(user=user)

    resp = client.get(reverse("accounts:family-children", args=[family.pk]))

    assert resp.status_code == 200
    names = [c["first_name"] for c in resp.data]
    assert names == ["Mine"]


def test_create_child_assigns_family_from_url(client, user, family):
    client.force_authenticate(user=user)

    resp = client.post(
        reverse("accounts:family-children", args=[family.pk]),
        {"first_name": "Leo"},
        format="json",
    )

    assert resp.status_code == 201
    child = Child.objects.get(id=resp.data["id"])
    assert child.family == family


def test_update_child_renames(client, user, family):
    child = Child.objects.create(family=family, first_name="Leo")
    client.force_authenticate(user=user)

    resp = client.patch(
        reverse("accounts:family-child", args=[family.pk, child.pk]),
        {"first_name": "Leon"},
        format="json",
    )

    assert resp.status_code == 200
    child.refresh_from_db()
    assert child.first_name == "Leon"


def test_delete_child_removes_it(client, user, family):
    child = Child.objects.create(family=family, first_name="Leo")
    client.force_authenticate(user=user)

    resp = client.delete(reverse("accounts:family-child", args=[family.pk, child.pk]))

    assert resp.status_code == 204
    assert not Child.objects.filter(id=child.pk).exists()


def test_cannot_access_another_familys_children(client, user, other_family):
    Child.objects.create(family=other_family, first_name="Theirs")
    client.force_authenticate(user=user)

    # Not a member of other_family: the whole collection is forbidden.
    resp = client.get(reverse("accounts:family-children", args=[other_family.pk]))
    assert resp.status_code == 403


def test_unclaimed_family_creator_can_manage_children(client, user):
    """The creator of an unclaimed family sets up children before handoff."""
    fam = Family.objects.create(name="For a friend", created_by=user)  # no membership
    client.force_authenticate(user=user)

    resp = client.post(
        reverse("accounts:family-children", args=[fam.pk]),
        {"first_name": "Ada"},
        format="json",
    )

    assert resp.status_code == 201
    assert fam.children.count() == 1


def test_children_require_authentication(client, family):
    assert client.get(reverse("accounts:family-children", args=[family.pk])).status_code == 401
