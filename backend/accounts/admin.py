from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import Child, User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """Admin tailored to the email-login user (no username field)."""

    ordering = ("email",)
    list_display = ("email", "first_name", "last_name", "is_staff")
    search_fields = ("email", "first_name", "last_name")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name")}),
        (
            "Permissions",
            {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "password1", "password2")}),
    )


@admin.register(Child)
class ChildAdmin(admin.ModelAdmin):
    """Admin listing of children and their parent user."""

    list_display = ("first_name", "parent")
    search_fields = ("first_name", "parent__email")
