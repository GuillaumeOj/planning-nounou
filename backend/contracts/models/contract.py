from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING, ClassVar

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from accounts.tokens import default_invitation_expiry, generate_invitation_token
from config.models import UUIDModel
from contracts.models._common import current_snapshot
from nannies.models import Nanny

if TYPE_CHECKING:
    from django.db.models.fields.related_descriptors import RelatedManager

    from contracts.models.coverage import ContractChild
    from contracts.models.declaration import MonthlyDeclaration
    from contracts.models.exceptional import ExceptionalHours, ExceptionalPresence
    from contracts.models.leave import Leave
    from contracts.models.schedule import ContractSchedule
    from contracts.models.terms import ContractTerms


class ContractQuerySet(models.QuerySet):
    def _annotate_current(self, model, attr: str, on: date | None):
        """Annotate `attr` with the id of the snapshot from `model` in force on `on`."""
        on = on or timezone.localdate()
        latest = (
            model.objects.filter(contract=models.OuterRef("pk"), effective_from__lte=on)
            .order_by("-effective_from", "-id")
            .values("pk")[:1]
        )
        return self.annotate(**{attr: models.Subquery(latest)})

    def with_current_terms(self, on: date | None = None) -> models.QuerySet[Contract]:
        """Annotate the id of the terms snapshot effective on `on` (today)."""
        from contracts.models.terms import ContractTerms

        return self._annotate_current(ContractTerms, "current_terms_id", on)

    def with_current_schedule(self, on: date | None = None) -> models.QuerySet[Contract]:
        """Annotate the id of the schedule snapshot effective on `on` (today)."""
        from contracts.models.schedule import ContractSchedule

        return self._annotate_current(ContractSchedule, "current_schedule_id", on)


class Contract(UUIDModel):
    """One nanny's employment, shared by one or more families ("garde partagée").

    The families jointly agree the working hours and pay. pajemploi cannot split
    an hourly *rate* between employers, so families split the *hours* instead:
    each declares the share attributable to it, all at the same rate, and the
    shares must sum to the hours actually worked. That split is derived from
    which children are present at each moment (:class:`ContractChild`,
    :class:`ContractChildWindow`) weighted by :attr:`split_method` — see
    ``docs/shared-care-pay.md``.

    Compensation and schedule are versioned as effective-dated snapshots
    (:class:`ContractTerms`, :class:`ContractSchedule`).
    """

    class SplitMethod(models.TextChoices):
        EQUAL = "equal", _("Equally between the families present")
        BY_CHILDREN = "by_children", _("In proportion to the children present")

    nanny = models.ForeignKey(Nanny, on_delete=models.CASCADE, related_name="contracts")
    families = models.ManyToManyField(
        "accounts.Family", through="ContractShare", related_name="contracts"
    )
    # The children this contract covers. Not every child of a participating
    # family need be on it, and a child's hours may be narrower than the nanny's
    # (see ContractChildWindow).
    children = models.ManyToManyField(
        "children.Child", through="ContractChild", related_name="contracts"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contracts_created",
    )
    starting_date = models.DateField()
    ending_date = models.DateField(null=True, blank=True)
    # How a moment's hours divide between the families whose children are there.
    # Agreed once, when the contract is signed: two families with 2 and 1
    # children may still settle on halves, so this cannot be derived.
    split_method = models.CharField(
        max_length=20, choices=SplitMethod.choices, default=SplitMethod.EQUAL
    )
    # Annual paid-leave days (congés payés) agreed in the contract.
    paid_leave_days = models.PositiveSmallIntegerField(default=0)
    notes = models.TextField(blank=True)

    objects = ContractQuerySet.as_manager()

    if TYPE_CHECKING:
        nanny_id: uuid.UUID
        shares: RelatedManager[ContractShare]
        contract_children: RelatedManager[ContractChild]
        terms: RelatedManager[ContractTerms]
        schedules: RelatedManager[ContractSchedule]
        invitations: RelatedManager[ContractInvitation]
        leaves: RelatedManager[Leave]
        exceptional_hours: RelatedManager[ExceptionalHours]
        exceptional_presences: RelatedManager[ExceptionalPresence]
        declarations: RelatedManager[MonthlyDeclaration]

    class Meta:
        ordering: ClassVar[list[str]] = ["-starting_date"]

    def __str__(self) -> str:
        return f"{self.nanny} (from {self.starting_date})"

    def current_terms(self, on: date | None = None) -> ContractTerms | None:
        """Latest terms snapshot effective on `on` (default today), or None."""
        return current_snapshot(self.terms, on or timezone.localdate())

    def current_schedule(self, on: date | None = None) -> ContractSchedule | None:
        """Latest schedule snapshot effective on `on` (default today), or None."""
        return current_snapshot(self.schedules, on or timezone.localdate())

    def add_family(self, family, *, is_originator: bool = False) -> ContractShare:
        """Attach ``family`` to this contract, idempotently, and return the share.

        The single join point shared by the invitation-accept flow and the
        direct-attach action: re-attaching keeps the existing share. The caller is
        responsible for checking that the acting user may act for ``family``.
        """
        share, _created = ContractShare.objects.get_or_create(
            contract=self, family=family, defaults={"is_originator": is_originator}
        )
        return share


class ContractShare(UUIDModel):
    """Links a family to a shared contract. The through model for `Contract.families`."""

    contract = models.ForeignKey(Contract, on_delete=models.CASCADE, related_name="shares")
    family = models.ForeignKey(
        "accounts.Family", on_delete=models.CASCADE, related_name="contract_shares"
    )
    # The family that created the contract; the others joined by invitation.
    is_originator = models.BooleanField(default=False)
    added_at = models.DateTimeField(auto_now_add=True)

    if TYPE_CHECKING:
        family_id: uuid.UUID

    class Meta:
        constraints: ClassVar[list] = [
            models.UniqueConstraint(fields=["contract", "family"], name="uniq_contract_family"),
        ]

    def __str__(self) -> str:
        return f"{self.family} shares {self.contract}"


class ContractInvitation(UUIDModel):
    """An invitation for an email address to share a contract with one of their families.

    Targets an email rather than a user, so it works whether or not the invitee
    already has an account. On accept, the invitee picks which family they own
    to attach to the contract.
    """

    class Status(models.TextChoices):
        PENDING = "pending", _("Pending")
        ACCEPTED = "accepted", _("Accepted")
        DECLINED = "declined", _("Declined")
        REVOKED = "revoked", _("Revoked")

    contract = models.ForeignKey(Contract, on_delete=models.CASCADE, related_name="invitations")
    email = models.EmailField()
    token = models.CharField(max_length=64, unique=True, default=generate_invitation_token)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(default=default_invitation_expiry)
    responded_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.email} → {self.contract} ({self.status})"

    @property
    def is_actionable(self) -> bool:
        """Only pending, unexpired invitations can be accepted or declined."""
        return self.status == self.Status.PENDING and self.expires_at > timezone.now()

    def accept(self, family) -> ContractShare:
        """Attach ``family`` to the contract and mark the invitation accepted.

        Idempotent on the share: re-accepting keeps the existing share. The
        caller is responsible for checking that the acting user may act for
        ``family``.
        """
        with transaction.atomic():
            share = self.contract.add_family(family)
            self.status = self.Status.ACCEPTED
            self.responded_at = timezone.now()
            self.save(update_fields=["status", "responded_at"])
        return share

    def decline(self) -> None:
        self.status = self.Status.DECLINED
        self.responded_at = timezone.now()
        self.save(update_fields=["status", "responded_at"])
