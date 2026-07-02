import pytest

from accounts.models import Child, User

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
    user = User.objects.create_user(email="parent@example.com", password="s3cret-pass")
    child = Child.objects.create(parent=user, first_name="Mia")

    assert str(child) == "Mia"
    assert list(user.children.all()) == [child]
