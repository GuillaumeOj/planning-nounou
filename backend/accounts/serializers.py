from django.contrib.auth.password_validation import validate_password
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from .models import Child, User


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


class RegisterSerializer(serializers.ModelSerializer):
    email = unique_email_field()
    password = serializers.CharField(
        write_only=True,
        style={"input_type": "password"},
    )

    class Meta:
        model = User
        fields = ("id", "email", "password", "first_name", "last_name")
        read_only_fields = ("id",)
        extra_kwargs = {
            "first_name": {"required": False},
            "last_name": {"required": False},
        }

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

    def create(self, validated_data: dict) -> User:
        password = validated_data.pop("password")
        return User.objects.create_user(password=password, **validated_data)


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
    """A child of the authenticated user; the parent is set from the request."""

    class Meta:
        model = Child
        fields = ("id", "first_name")
