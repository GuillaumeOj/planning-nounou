import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Family, FamilyMembership, Invitation, User

pytestmark = pytest.mark.django_db

VALID_PASSWORD = "sufficiently-long-pass-42"


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def owner():
    return User.objects.create_user(email="owner@example.com", password=VALID_PASSWORD)


@pytest.fixture
def friend():
    return User.objects.create_user(email="friend@example.com", password=VALID_PASSWORD)


def make_family(owner, *, name="Home"):
    fam = Family.objects.create(name=name, created_by=owner)
    FamilyMembership.objects.create(family=fam, user=owner, role=FamilyMembership.Role.OWNER)
    return fam


# --- URL mounting -----------------------------------------------------------


def test_families_are_mounted_at_api_root(client, owner):
    """Guards the concrete path the SPA calls: families live at /api/families/,
    not under /api/auth/. reverse() alone would not catch a wrong mount point."""
    client.force_authenticate(user=owner)

    assert client.get("/api/families/").status_code == 200
    # The auth endpoints stay under /api/auth/.
    assert client.get("/api/auth/me/").status_code == 200


# --- Family creation --------------------------------------------------------


def test_create_family_makes_creator_owner(client, owner):
    client.force_authenticate(user=owner)

    resp = client.post(reverse("accounts:family-list"), {"name": "The Nest"}, format="json")

    assert resp.status_code == 201
    assert resp.data["role"] == "owner"
    fam = Family.objects.get(id=resp.data["id"])
    assert fam.memberships.get(user=owner).role == "owner"


def test_create_unclaimed_family_has_no_members(client, owner):
    client.force_authenticate(user=owner)

    resp = client.post(
        reverse("accounts:family-list"),
        {"name": "For Someone", "claim": False},
        format="json",
    )

    assert resp.status_code == 201
    assert resp.data["role"] is None
    assert resp.data["is_claimed"] is False
    fam = Family.objects.get(id=resp.data["id"])
    assert fam.memberships.count() == 0
    assert fam.created_by == owner


def test_list_families_scoped_to_user(client, owner, friend):
    mine = make_family(owner, name="Mine")
    make_family(friend, name="Theirs")
    client.force_authenticate(user=owner)

    resp = client.get(reverse("accounts:family-list"))

    assert resp.status_code == 200
    assert [f["id"] for f in resp.data] == [str(mine.id)]


# --- Invitations: existing user accepts -------------------------------------


def test_owner_invites_and_existing_user_accepts(client, owner, friend):
    fam = make_family(owner)
    client.force_authenticate(user=owner)

    invite_resp = client.post(
        reverse("accounts:family-invitations", args=[fam.pk]),
        {"email": friend.email, "role": "member"},
        format="json",
    )
    assert invite_resp.status_code == 201
    invitation = Invitation.objects.get(family=fam, email=friend.email)
    # The token is returned so a manager can build a shareable invite link.
    assert invite_resp.data["token"] == invitation.token

    client.force_authenticate(user=friend)
    accept_resp = client.post(reverse("accounts:invitation-accept", args=[invitation.token]))

    assert accept_resp.status_code == 200
    invitation.refresh_from_db()
    assert invitation.status == Invitation.Status.ACCEPTED
    assert fam.memberships.filter(user=friend, role="member").exists()


def test_non_manager_cannot_invite(client, owner, friend):
    fam = make_family(owner)
    FamilyMembership.objects.create(family=fam, user=friend, role=FamilyMembership.Role.MEMBER)
    client.force_authenticate(user=friend)

    resp = client.post(
        reverse("accounts:family-invitations", args=[fam.pk]),
        {"email": "someone@example.com"},
        format="json",
    )

    assert resp.status_code == 403


def test_duplicate_pending_invite_rejected(client, owner):
    fam = make_family(owner)
    client.force_authenticate(user=owner)
    payload = {"email": "dup@example.com"}
    url = reverse("accounts:family-invitations", args=[fam.pk])

    assert client.post(url, payload, format="json").status_code == 201
    assert client.post(url, payload, format="json").status_code == 400


# --- Invitation inbox (addressed to the current user) -----------------------


def test_inbox_lists_pending_invitations_for_current_user(client, owner, friend):
    fam = make_family(owner, name="Dupont")
    invitation = Invitation.objects.create(family=fam, email=friend.email)
    client.force_authenticate(user=friend)

    resp = client.get(reverse("accounts:my-invitations"))

    assert resp.status_code == 200
    assert len(resp.data) == 1
    assert resp.data[0]["family_name"] == "Dupont"
    assert resp.data[0]["token"] == invitation.token


def test_inbox_matches_email_case_insensitively(client, owner):
    upper = User.objects.create_user(email="Cap@Example.com", password=VALID_PASSWORD)
    fam = make_family(owner)
    Invitation.objects.create(family=fam, email="cap@example.com")
    client.force_authenticate(user=upper)

    resp = client.get(reverse("accounts:my-invitations"))

    assert resp.status_code == 200
    assert len(resp.data) == 1


def test_inbox_excludes_others_and_non_actionable(client, owner, friend):
    from datetime import timedelta

    from django.utils import timezone

    fam = make_family(owner)
    # Addressed to someone else.
    Invitation.objects.create(family=fam, email="other@example.com")
    # Already accepted.
    Invitation.objects.create(family=fam, email=friend.email, status=Invitation.Status.ACCEPTED)
    # Expired.
    Invitation.objects.create(
        family=fam,
        email=friend.email,
        expires_at=timezone.now() - timedelta(days=1),
    )
    client.force_authenticate(user=friend)

    resp = client.get(reverse("accounts:my-invitations"))

    assert resp.status_code == 200
    assert resp.data == []


# --- Invitations: new user claims via registration --------------------------


def test_new_user_claims_family_via_registration(client, owner):
    """The 'create a family for someone to claim and own' flow."""
    fam = Family.objects.create(name="Gift Family", created_by=owner)  # unclaimed
    invitation = Invitation.objects.create(
        family=fam, email="newbie@example.com", role=FamilyMembership.Role.OWNER
    )

    resp = client.post(
        reverse("accounts:register"),
        {
            "email": "newbie@example.com",
            "password": VALID_PASSWORD,
            "invitation_token": invitation.token,
        },
        format="json",
    )

    assert resp.status_code == 201
    new_user = User.objects.get(email="newbie@example.com")
    invitation.refresh_from_db()
    assert invitation.status == Invitation.Status.ACCEPTED
    assert fam.memberships.get(user=new_user).role == "owner"
    # The family is now claimed; the creator no longer has access.
    assert fam.can_access(owner) is False


def test_register_with_bad_token_rejected(client):
    resp = client.post(
        reverse("accounts:register"),
        {"email": "x@example.com", "password": VALID_PASSWORD, "invitation_token": "nope"},
        format="json",
    )

    assert resp.status_code == 400
    assert not User.objects.filter(email="x@example.com").exists()


# --- Invitation preview / decline -------------------------------------------


def test_invitation_preview_is_public(client, owner):
    fam = make_family(owner, name="Peek")
    invitation = Invitation.objects.create(family=fam, email="peek@example.com")

    resp = client.get(reverse("accounts:invitation-preview", args=[invitation.token]))

    assert resp.status_code == 200
    assert resp.data["family_name"] == "Peek"
    assert "token" not in resp.data


def test_decline_invitation(client, owner, friend):
    fam = make_family(owner)
    invitation = Invitation.objects.create(family=fam, email=friend.email)
    client.force_authenticate(user=friend)

    resp = client.post(reverse("accounts:invitation-decline", args=[invitation.token]))

    assert resp.status_code == 204
    invitation.refresh_from_db()
    assert invitation.status == Invitation.Status.DECLINED
    assert not fam.memberships.filter(user=friend).exists()


# --- Membership management --------------------------------------------------


def test_sole_owner_cannot_leave(client, owner):
    fam = make_family(owner)
    client.force_authenticate(user=owner)

    resp = client.post(reverse("accounts:family-leave", args=[fam.pk]))

    assert resp.status_code == 400
    assert fam.memberships.filter(user=owner).exists()


def test_member_can_leave(client, owner, friend):
    fam = make_family(owner)
    FamilyMembership.objects.create(family=fam, user=friend, role=FamilyMembership.Role.MEMBER)
    client.force_authenticate(user=friend)

    resp = client.post(reverse("accounts:family-leave", args=[fam.pk]))

    assert resp.status_code == 204
    assert not fam.memberships.filter(user=friend).exists()


def test_owner_removes_member(client, owner, friend):
    fam = make_family(owner)
    membership = FamilyMembership.objects.create(
        family=fam, user=friend, role=FamilyMembership.Role.MEMBER
    )
    client.force_authenticate(user=owner)

    resp = client.delete(reverse("accounts:family-member", args=[fam.pk, membership.pk]))

    assert resp.status_code == 204
    assert not fam.memberships.filter(user=friend).exists()


def test_cannot_remove_sole_owner(client, owner):
    fam = make_family(owner)
    membership = fam.memberships.get(user=owner)
    client.force_authenticate(user=owner)

    resp = client.delete(reverse("accounts:family-member", args=[fam.pk, membership.pk]))

    assert resp.status_code == 400
    assert fam.memberships.filter(user=owner).exists()
