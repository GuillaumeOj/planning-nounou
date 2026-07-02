from django.contrib.admin.sites import AdminSite

from accounts.admin import UserAdmin
from accounts.models import User


def test_user_admin_is_configured_for_email_login():
    admin = UserAdmin(User, AdminSite())

    assert admin.ordering == ("email",)
    assert "email" in admin.list_display
    # The stock username field must not leak into the add form.
    add_fields = admin.add_fieldsets[0][1]["fields"]
    assert "username" not in add_fields
    assert "email" in add_fields
