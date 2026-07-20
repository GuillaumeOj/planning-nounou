from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from children.models import Child

from .models import Family, FamilyMembership, Invitation, User


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
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("email", "password1", "password2")}),)


class FamilyMembershipInline(admin.TabularInline):
    """Manage a family's members inline from the family page."""

    model = FamilyMembership
    fk_name = "family"
    extra = 0
    autocomplete_fields = ("user", "invited_by")


class ChildInline(admin.TabularInline):
    model = Child
    extra = 0


@admin.register(Family)
class FamilyAdmin(admin.ModelAdmin):
    list_display = ("name", "created_by", "is_claimed", "created_at")
    search_fields = ("name", "created_by__email")
    inlines = (FamilyMembershipInline, ChildInline)

    @admin.display(boolean=True, description="Claimed")
    def is_claimed(self, obj: Family) -> bool:
        return obj.is_claimed


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ("email", "family", "role", "status", "expires_at")
    list_filter = ("status", "role")
    search_fields = ("email", "family__name")
    readonly_fields = ("token", "created_at", "responded_at")
