import pytest

from accounts.models import Child, Family, FamilyMembership, User

pytestmark = pytest.mark.django_db


def test_create_user_normalizes_email_and_hashes_password():
    user = User.objects.create_user(email="Nanny@Example.COM", password="s3cret-pass")

    # Domain part is lowercased by normalize_email.
    assert user.email == "Nanny@example.com"
    assert user.pk is not None
    assert user.password != "s3cret-pass"
    assert user.check_password("s3cret-pass")
    assert user.is_staff is False
    assert user.is_superuser is False


def test_create_user_requires_email():
    with pytest.raises(ValueError, match="email address must be set"):
        User.objects.create_user(email="", password="whatever-123")


def test_create_superuser_sets_flags():
    admin = User.objects.create_superuser(email="admin@example.com", password="s3cret-pass")

    assert admin.is_staff is True
    assert admin.is_superuser is True


@pytest.mark.parametrize(
    ("field", "value"),
    [("is_staff", False), ("is_superuser", False)],
)
def test_create_superuser_rejects_bad_flags(field, value):
    with pytest.raises(ValueError):
        User.objects.create_superuser(
            email="admin@example.com",
            password="s3cret-pass",
            **{field: value},
        )


def test_str_is_email():
    user = User.objects.create_user(email="who@example.com", password="s3cret-pass")
    assert str(user) == "who@example.com"


def test_child_str_is_first_name():
    family = Family.objects.create(name="The Smiths")
    child = Child.objects.create(family=family, first_name="Mia")

    assert str(child) == "Mia"
    assert list(family.children.all()) == [child]


def test_family_claim_and_access_rules():
    creator = User.objects.create_user(email="creator@example.com", password="s3cret-pass")
    stranger = User.objects.create_user(email="stranger@example.com", password="s3cret-pass")
    family = Family.objects.create(name="For Someone", created_by=creator)

    # Unclaimed: no owner yet, creator can access and manage, stranger cannot.
    assert family.is_claimed is False
    assert family.can_access(creator) is True
    assert family.can_manage(creator) is True
    assert family.can_access(stranger) is False

    # Once the stranger claims it as owner, the creator loses access.
    FamilyMembership.objects.create(family=family, user=stranger, role=FamilyMembership.Role.OWNER)
    assert family.is_claimed is True
    assert family.can_access(stranger) is True
    assert family.can_manage(stranger) is True
    assert family.can_access(creator) is False
    assert family.can_manage(creator) is False


def test_accessible_to_spans_membership_and_unclaimed_created():
    user = User.objects.create_user(email="u@example.com", password="s3cret-pass")
    member_family = Family.objects.create(name="Member of")
    FamilyMembership.objects.create(family=member_family, user=user)
    unclaimed = Family.objects.create(name="Unclaimed", created_by=user)
    claimed_by_other = Family.objects.create(name="Other", created_by=user)
    other = User.objects.create_user(email="o@example.com", password="s3cret-pass")
    FamilyMembership.objects.create(
        family=claimed_by_other, user=other, role=FamilyMembership.Role.OWNER
    )

    accessible = set(Family.objects.accessible_to(user).values_list("id", flat=True))

    assert accessible == {member_family.id, unclaimed.id}
