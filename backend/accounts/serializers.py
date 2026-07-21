from django.db import transaction
from django.utils.translation import gettext_lazy as _
from djoser.serializers import SetUsernameSerializer as DjoserSetUsernameSerializer
from djoser.serializers import UserCreateSerializer as DjoserUserCreateSerializer
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from .models import Family, FamilyMembership, Invitation, User
from .notifications import send_family_invitation_email


def _case_insensitive_unique_email() -> UniqueValidator:
    """Our case-insensitive unique-email validator with a translated message.

    Replaces the model's default (case-sensitive) validator. Shared by
    registration and the email-change flow.
    """
    return UniqueValidator(
        queryset=User.objects.all(),
        lookup="iexact",
        message=_("A user with this email already exists."),
    )


def unique_email_field() -> serializers.EmailField:
    """An email field carrying the case-insensitive uniqueness check above."""
    return serializers.EmailField(validators=[_case_insensitive_unique_email()])


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


class RegisterSerializer(DjoserUserCreateSerializer):
    """djoser's user-create serializer, extended for our two custom needs:

    case-insensitive-unique email (with our i18n message) and the optional
    ``invitation_token`` that joins the new account to the invited family on
    creation. Password validation and the inactive-until-activated handling are
    inherited from djoser.
    """

    email = unique_email_field()
    # Optional: when set, the new account joins the invited family on creation.
    invitation_token = serializers.CharField(write_only=True, required=False)

    class Meta(DjoserUserCreateSerializer.Meta):
        fields = ("id", "email", "password", "first_name", "last_name", "invitation_token")
        read_only_fields = ("id",)
        extra_kwargs = {
            "first_name": {"required": False},
            "last_name": {"required": False},
        }

    def validate_invitation_token(self, value: str) -> str:
        # Validate up front so registration fails cleanly on a bad token.
        resolve_invitation_or_raise(value)
        return value

    def validate(self, attrs: dict) -> dict:
        # djoser's base validate builds ``User(**attrs)`` to run password
        # validation; the non-model invitation_token would break that, so set it
        # aside and reuse it in perform_create.
        self._invitation_token = attrs.pop("invitation_token", None)
        return super().validate(attrs)

    def perform_create(self, validated_data: dict) -> User:
        user = super().perform_create(validated_data)
        # validate() sets this; default None guards a save() without validation.
        token = getattr(self, "_invitation_token", None)
        if token:
            # Re-resolve here; still actionable barring a race.
            resolve_invitation_or_raise(token).accept(user)
        return user


class SetEmailSerializer(DjoserSetUsernameSerializer):
    """djoser's change-email serializer (guarded by ``current_password``) with our
    case-insensitive-unique email validator and translated message re-applied."""

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        # djoser renames the login field to ``new_email``; swap its default
        # (case-sensitive) uniqueness validator for our case-insensitive one.
        field = self.fields["new_email"]
        field.validators = [v for v in field.validators if not isinstance(v, UniqueValidator)]
        field.validators.append(_case_insensitive_unique_email())


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

    Creating one emails the invitee a Brevo-hosted invite link (see
    accounts/notifications.py). ``token`` is still exposed read-only so a manager can
    re-share the link manually if needed; only family managers reach this endpoint and
    the public preview never exposes the token.
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
        # Send within the request, but inside the same transaction as the insert: a
        # delivery failure rolls the invitation back so the manager can retry cleanly.
        # A committed-but-unsent pending row would otherwise trip the duplicate-pending
        # guard above and block re-inviting the same address.
        with transaction.atomic():
            invitation = Invitation.objects.create(
                family=self.context["family"],
                invited_by=self.context["request"].user,
                **validated_data,
            )
            send_family_invitation_email(invitation)
        return invitation


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
