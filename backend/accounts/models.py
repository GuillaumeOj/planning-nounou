from __future__ import annotations

import secrets
import uuid
from datetime import timedelta
from typing import TYPE_CHECKING, ClassVar

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from config.models import UUIDModel

from .managers import UserManager

if TYPE_CHECKING:
    from django.db.models.fields.related_descriptors import RelatedManager


class User(UUIDModel, AbstractUser):
    """Custom user that logs in with an email address instead of a username."""

    username = None  # type: ignore[assignment]
    email = models.EmailField("email address", unique=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    objects = UserManager()

    def __str__(self) -> str:
        return self.email


class FamilyManager(models.Manager["Family"]):
    def accessible_to(self, user) -> models.QuerySet[Family]:
        """Families the user may see: ones they belong to, plus unclaimed
        families they created (no members yet, awaiting a claim)."""
        return self.filter(
            models.Q(memberships__user=user) | models.Q(created_by=user, memberships__isnull=True)
        ).distinct()


class Family(UUIDModel):
    """A household that groups children and the parents who manage them.

    A family is managed through :class:`FamilyMembership` rows. It may be
    created *unclaimed* (no members yet) so a user can set it up on someone
    else's behalf and invite them to claim ownership; until then the creator
    keeps access via ``created_by``.
    """

    name = models.CharField(max_length=150)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="families_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    members = models.ManyToManyField(
        User,
        through="FamilyMembership",
        through_fields=("family", "user"),
        related_name="families",
    )

    objects = FamilyManager()

    if TYPE_CHECKING:
        created_by_id: uuid.UUID | None
        memberships: RelatedManager[FamilyMembership]
        children: RelatedManager[Child]

    def __str__(self) -> str:
        return self.name

    @property
    def is_claimed(self) -> bool:
        """True once at least one owner has joined; an unclaimed family has none."""
        return self.memberships.filter(role=FamilyMembership.Role.OWNER).exists()

    def _is_unclaimed_creator(self, user) -> bool:
        """The creator keeps control until the first member (an owner) joins."""
        return self.created_by_id == user.id and not self.memberships.exists()

    def can_access(self, user) -> bool:
        """Any member, or the creator while the family is still unclaimed."""
        return self.memberships.filter(user=user).exists() or self._is_unclaimed_creator(user)

    def can_manage(self, user) -> bool:
        """Owners manage members and invitations; so does the creator of an
        unclaimed family (there is no owner yet to do it)."""
        return self.memberships.filter(
            user=user, role=FamilyMembership.Role.OWNER
        ).exists() or self._is_unclaimed_creator(user)


class FamilyMembership(UUIDModel):
    """Links a user to a family with a role. The through model for members."""

    class Role(models.TextChoices):
        OWNER = "owner", _("Owner")
        MEMBER = "member", _("Member")

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.MEMBER)
    invited_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    if TYPE_CHECKING:
        user_id: uuid.UUID

    class Meta:
        constraints: ClassVar[list] = [
            models.UniqueConstraint(fields=["family", "user"], name="uniq_family_member"),
        ]

    def __str__(self) -> str:
        return f"{self.user} in {self.family} ({self.role})"


class Child(UUIDModel):
    """A child belonging to a family."""

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name="children")
    first_name = models.CharField(max_length=150)

    def __str__(self) -> str:
        return self.first_name


def generate_invitation_token() -> str:
    """A URL-safe secret embedded in the invite link."""
    return secrets.token_urlsafe(32)


def default_invitation_expiry():
    """Invitations are actionable for a week by default."""
    return timezone.now() + timedelta(days=7)


class Invitation(UUIDModel):
    """An invitation for an email address to join a family.

    Targets an email rather than a user, so it works whether or not the
    invitee already has an account: an existing user accepts while logged in,
    a new user accepts by registering with the token.
    """

    class Status(models.TextChoices):
        PENDING = "pending", _("Pending")
        ACCEPTED = "accepted", _("Accepted")
        DECLINED = "declined", _("Declined")
        REVOKED = "revoked", _("Revoked")

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name="invitations")
    email = models.EmailField()
    role = models.CharField(
        max_length=20,
        choices=FamilyMembership.Role.choices,
        default=FamilyMembership.Role.MEMBER,
    )
    token = models.CharField(max_length=64, unique=True, default=generate_invitation_token)
    invited_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(default=default_invitation_expiry)
    responded_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.email} → {self.family} ({self.status})"

    @property
    def is_actionable(self) -> bool:
        """Only pending, unexpired invitations can be accepted or declined."""
        return self.status == self.Status.PENDING and self.expires_at > timezone.now()

    def accept(self, user: User) -> FamilyMembership:
        """Add ``user`` to the family with the invited role and mark accepted.

        Idempotent on membership: if the user is already in the family their
        existing role is kept. This is the single claim path shared by the
        accept endpoint and registration-with-token.
        """
        from django.db import transaction

        with transaction.atomic():
            membership, _ = FamilyMembership.objects.get_or_create(
                family=self.family,
                user=user,
                defaults={"role": self.role, "invited_by": self.invited_by},
            )
            self.status = self.Status.ACCEPTED
            self.responded_at = timezone.now()
            self.save(update_fields=["status", "responded_at"])
        return membership

    def decline(self) -> None:
        self.status = self.Status.DECLINED
        self.responded_at = timezone.now()
        self.save(update_fields=["status", "responded_at"])
