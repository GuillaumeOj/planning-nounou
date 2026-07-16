import pytest
from django.conf import settings
from django.contrib.admin.sites import AdminSite
from django.urls import Resolver404, resolve, reverse

from accounts.admin import UserAdmin
from accounts.models import User


def test_admin_is_mounted_under_the_configured_api_path():
    # Admin lives under /api/ at the per-environment ADMIN_PATH so Vercel's
    # /api -> backend rewrite reaches it (see config/settings.py).
    assert reverse("admin:index") == f"/api/{settings.ADMIN_PATH}/"
    assert resolve(f"/api/{settings.ADMIN_PATH}/").namespace == "admin"


def test_well_known_admin_path_is_not_exposed():
    # The guessable /admin/ must not resolve — in production it falls through to the SPA.
    with pytest.raises(Resolver404):
        resolve("/admin/")


def test_user_admin_is_configured_for_email_login():
    admin = UserAdmin(User, AdminSite())

    assert admin.ordering == ("email",)
    assert "email" in admin.list_display
    # The stock username field must not leak into the add form.
    add_fields = admin.add_fieldsets[0][1]["fields"]
    assert "username" not in add_fields
    assert "email" in add_fields
