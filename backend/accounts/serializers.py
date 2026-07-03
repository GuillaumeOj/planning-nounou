from django.contrib.auth.password_validation import validate_password
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from .models import Child, Family, FamilyMembership, Invitation, User


def unique_email_field() -> serializers.EmailField:
    """An email field with a case-insensitive uniqueness check.

    Replaces the model's default (case-sensitive) validator and carries our
    translated message. Shared by registration and the email-change flow.
    """
    return serializers.EmailField(
        validators=[
            UniqueValidator(
                queryset=User.objects.all(),
                lookup="iexact",
                message=_("A user with this email already exists."),
            )
        ]
    )


class CurrentPasswordMixin(serializers.Serializer):
    """Adds a `current_password` field that must match the requesting user's.

    Used to guard sensitive account changes (email, password) behind a
    re-authentication step.
    """

    current_password = serializers.CharField(
        write_only=True,
        style={"input_type": "password"},
    )

    def validate_current_password(self, value: str) -> str:
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError(_("The current password is incorrect."))
        return value


class ProfileSerializer(serializers.ModelSerializer):
    """Read the profile and update the user's names.

    Email is read-only here; it is changed through the dedicated email
    endpoint, which requires the current password.
    """

    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name")
        read_only_fields = ("id", "email")


def resolve_invitation_or_raise(token: str) -> Invitation:
    """Look up an actionable invitation by token, or raise a validation error."""
    try:
        invitation = Invitation.objects.get(token=token)
    except Invitation.DoesNotExist:
        raise serializers.ValidationError(_("This invitation is not valid.")) from None
    if not invitation.is_actionable:
        raise serializers.ValidationError(_("This invitation has expired or was already used."))
    return invitation


class RegisterSerializer(serializers.ModelSerializer):
    email = unique_email_field()
    password = serializers.CharField(
        write_only=True,
        style={"input_type": "password"},
    )
    # Optional: when set, the new account joins the invited family on creation.
    invitation_token = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ("id", "email", "password", "first_name", "last_name", "invitation_token")
        read_only_fields = ("id",)
        extra_kwargs = {
            "first_name": {"required": False},
            "last_name": {"required": False},
        }

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

    def validate_invitation_token(self, value: str) -> str:
        # Validate up front so registration fails cleanly on a bad token.
        resolve_invitation_or_raise(value)
        return value

    def create(self, validated_data: dict) -> User:
        password = validated_data.pop("password")
        token = validated_data.pop("invitation_token", None)
        user = User.objects.create_user(password=password, **validated_data)
        if token:
            # Re-resolve inside create; still actionable barring a race.
            resolve_invitation_or_raise(token).accept(user)
        return user


class ChangeEmailSerializer(CurrentPasswordMixin):
    """Change the authenticated user's email, guarded by the current password."""

    email = unique_email_field()

    def save(self, **kwargs) -> User:
        user = self.context["request"].user
        user.email = self.validated_data["email"]
        user.save(update_fields=["email"])
        return user


class ChangePasswordSerializer(CurrentPasswordMixin):
    """Change the authenticated user's password, guarded by the current password."""

    new_password = serializers.CharField(
        write_only=True,
        style={"input_type": "password"},
    )

    def validate_new_password(self, value: str) -> str:
        validate_password(value, user=self.context["request"].user)
        return value

    def save(self, **kwargs) -> User:
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user


class ChildSerializer(serializers.ModelSerializer):
    """A child of a family; the family is taken from the URL, not the payload."""

    class Meta:
        model = Child
        fields = ("id", "first_name")


class FamilySerializer(serializers.ModelSerializer):
    """A family plus the requesting user's role in it.

    On create, ``claim`` (default true) makes the creator an owner-member. Pass
    ``claim=false`` to create an unclaimed family for someone else to claim via
    an invitation; the creator keeps access until it is claimed.
    """

    role = serializers.SerializerMethodField()
    is_claimed = serializers.SerializerMethodField()
    claim = serializers.BooleanField(write_only=True, required=False, default=True)

    class Meta:
        model = Family
        fields = ("id", "name", "role", "is_claimed", "created_at", "claim")
        read_only_fields = ("id", "created_at")

    def get_role(self, obj: Family) -> str | None:
        user = self.context["request"].user
        membership = next(
            (m for m in obj.memberships.all() if m.user_id == user.id),
            None,
        )
        return membership.role if membership else None

    def get_is_claimed(self, obj: Family) -> bool:
        # Read the prefetched memberships rather than re-querying per family.
        return any(m.role == FamilyMembership.Role.OWNER for m in obj.memberships.all())

    def create(self, validated_data: dict) -> Family:
        claim = validated_data.pop("claim", True)
        user = self.context["request"].user
        family = Family.objects.create(created_by=user, **validated_data)
        if claim:
            FamilyMembership.objects.create(
                family=family, user=user, role=FamilyMembership.Role.OWNER
            )
        return family


class FamilyMembershipSerializer(serializers.ModelSerializer):
    """A member of a family (read-only view of who belongs and their role)."""

    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)

    class Meta:
        model = FamilyMembership
        fields = ("id", "user", "email", "first_name", "last_name", "role", "joined_at")
        read_only_fields = fields


class InvitationSerializer(serializers.ModelSerializer):
    """Create and list invitations for a family.

    Exposes ``token`` read-only so managers can build a shareable invite link
    (there is no invite email backend yet). Only family managers can reach this
    endpoint, and they are the ones who send invites, so surfacing it to them is
    acceptable; the public preview endpoint never exposes it.
    """

    class Meta:
        model = Invitation
        fields = ("id", "email", "role", "status", "token", "created_at", "expires_at")
        read_only_fields = ("id", "status", "token", "created_at", "expires_at")

    def validate_email(self, value: str) -> str:
        return value.lower()

    def validate(self, attrs: dict) -> dict:
        family = self.context["family"]
        email = attrs["email"]
        if Invitation.objects.filter(
            family=family, email=email, status=Invitation.Status.PENDING
        ).exists():
            raise serializers.ValidationError(
                _("A pending invitation for this email already exists.")
            )
        if family.memberships.filter(user__email__iexact=email).exists():
            raise serializers.ValidationError(_("This person is already a member."))
        return attrs

    def create(self, validated_data: dict) -> Invitation:
        return Invitation.objects.create(
            family=self.context["family"],
            invited_by=self.context["request"].user,
            **validated_data,
        )


class InvitationPreviewSerializer(serializers.ModelSerializer):
    """Public, token-addressed view shown on the invite landing page."""

    family_name = serializers.CharField(source="family.name", read_only=True)

    class Meta:
        model = Invitation
        fields = ("email", "role", "status", "family_name", "expires_at")
        read_only_fields = fields


class MyInvitationSerializer(serializers.ModelSerializer):
    """A pending invitation addressed to the requesting user (their inbox).

    Includes the token so the client can accept/decline via the existing
    token endpoints; the invitee already holds this capability by email.
    """

    family_name = serializers.CharField(source="family.name", read_only=True)

    class Meta:
        model = Invitation
        fields = ("id", "family_name", "role", "token", "expires_at")
        read_only_fields = fields
