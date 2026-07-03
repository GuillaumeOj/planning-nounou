from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, ClassVar

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from accounts.models import default_invitation_expiry, generate_invitation_token
from config.models import UUIDModel

if TYPE_CHECKING:
    from django.db.models.fields.related_descriptors import RelatedManager


class Nanny(UUIDModel):
    """A childcare person ("garde d'enfants à domicile").

    Identity only. The employment relationship and its terms live on
    :class:`Contract`; a nanny may be shared by several families through one
    contract (see :class:`ContractShare`).
    """

    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    # Provenance, mirroring Family.created_by; a nanny is not *owned* by a user.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="nannies_created",
    )

    if TYPE_CHECKING:
        contracts: RelatedManager[Contract]

    class Meta:
        ordering: ClassVar[list[str]] = ["last_name", "first_name"]
        verbose_name_plural = "nannies"

    def __str__(self) -> str:
        return f"{self.first_name} {self.last_name}"


def _current_snapshot(queryset, on: date):
    """Latest effective-dated snapshot in `queryset` in force on `on`, or None."""
    return queryset.filter(effective_from__lte=on).order_by("-effective_from", "-id").first()


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
        return self._annotate_current(ContractTerms, "current_terms_id", on)

    def with_current_schedule(self, on: date | None = None) -> models.QuerySet[Contract]:
        """Annotate the id of the schedule snapshot effective on `on` (today)."""
        return self._annotate_current(ContractSchedule, "current_schedule_id", on)


class Contract(UUIDModel):
    """One nanny's employment, shared by one or more families ("garde partagée").

    The families jointly agree the working hours and pay; how the declared hours
    are later split between them (pajemploi) is out of scope. Compensation and
    schedule are versioned as effective-dated snapshots (:class:`ContractTerms`,
    :class:`ContractSchedule`).
    """

    nanny = models.ForeignKey(Nanny, on_delete=models.CASCADE, related_name="contracts")
    families = models.ManyToManyField(
        "accounts.Family", through="ContractShare", related_name="contracts"
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
    # Annual paid-leave days (congés payés) agreed in the contract.
    paid_leave_days = models.PositiveSmallIntegerField(default=0)
    notes = models.TextField(blank=True)

    objects = ContractQuerySet.as_manager()

    if TYPE_CHECKING:
        nanny_id: uuid.UUID
        shares: RelatedManager[ContractShare]
        terms: RelatedManager[ContractTerms]
        schedules: RelatedManager[ContractSchedule]
        invitations: RelatedManager[ContractInvitation]

    class Meta:
        ordering: ClassVar[list[str]] = ["-starting_date"]

    def __str__(self) -> str:
        return f"{self.nanny} (from {self.starting_date})"

    def current_terms(self, on: date | None = None) -> ContractTerms | None:
        """Latest terms snapshot effective on `on` (default today), or None."""
        return _current_snapshot(self.terms, on or timezone.localdate())

    def current_schedule(self, on: date | None = None) -> ContractSchedule | None:
        """Latest schedule snapshot effective on `on` (default today), or None."""
        return _current_snapshot(self.schedules, on or timezone.localdate())


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
            share, _created = ContractShare.objects.get_or_create(
                contract=self.contract, family=family
            )
            self.status = self.Status.ACCEPTED
            self.responded_at = timezone.now()
            self.save(update_fields=["status", "responded_at"])
        return share

    def decline(self) -> None:
        self.status = self.Status.DECLINED
        self.responded_at = timezone.now()
        self.save(update_fields=["status", "responded_at"])


NON_NEGATIVE = [MinValueValidator(Decimal("0"))]


class ContractTerms(UUIDModel):
    """An effective-dated compensation snapshot ("avenant").

    Editing terms creates a NEW row with a new ``effective_from`` rather than
    mutating the previous one, preserving the full history. Current terms are the
    latest row with ``effective_from <= today`` (see Contract.current_terms).
    """

    contract = models.ForeignKey(Contract, on_delete=models.CASCADE, related_name="terms")
    effective_from = models.DateField(default=timezone.localdate)

    net_hourly_rate = models.DecimalField(max_digits=6, decimal_places=2, validators=NON_NEGATIVE)
    transport_fee = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )
    mileage_rate = models.DecimalField(
        max_digits=5, decimal_places=3, default=Decimal("0"), validators=NON_NEGATIVE
    )
    benefits_in_kind = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )
    # Set when this snapshot was corrected in place (vs. a fresh dated version),
    # so the UI can flag the current state as "edited".
    edited = models.BooleanField(default=False)

    if TYPE_CHECKING:
        contract_id: uuid.UUID

    class Meta:
        ordering: ClassVar[list[str]] = ["-effective_from", "-id"]
        verbose_name_plural = "contract terms"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["contract", "effective_from"], name="uniq_terms_per_effective_date"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.contract} terms from {self.effective_from}"


class ContractSchedule(UUIDModel):
    """An effective-dated weekly-schedule snapshot.

    Editing the schedule creates a NEW row (with its own blocks) rather than
    mutating the previous one, preserving the full history.
    """

    contract = models.ForeignKey(Contract, on_delete=models.CASCADE, related_name="schedules")
    effective_from = models.DateField(default=timezone.localdate)
    # Set when corrected in place (see ContractTerms.edited).
    edited = models.BooleanField(default=False)

    if TYPE_CHECKING:
        id: int
        contract_id: int
        blocks: RelatedManager[ScheduleBlock]

    class Meta:
        ordering: ClassVar[list[str]] = ["-effective_from", "-id"]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["contract", "effective_from"], name="uniq_schedule_per_effective_date"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.contract} schedule from {self.effective_from}"


class ScheduleBlock(UUIDModel):
    """A single time block of a weekly schedule (recurring template)."""

    class Weekday(models.IntegerChoices):
        MONDAY = 0, _("Monday")
        TUESDAY = 1, _("Tuesday")
        WEDNESDAY = 2, _("Wednesday")
        THURSDAY = 3, _("Thursday")
        FRIDAY = 4, _("Friday")
        SATURDAY = 5, _("Saturday")
        SUNDAY = 6, _("Sunday")

    schedule = models.ForeignKey(ContractSchedule, on_delete=models.CASCADE, related_name="blocks")
    weekday = models.IntegerField(choices=Weekday.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering: ClassVar[list[str]] = ["weekday", "start_time"]

    def __str__(self) -> str:
        return f"{self.get_weekday_display()} {self.start_time}–{self.end_time}"  # ty: ignore[unresolved-attribute]

    def clean(self) -> None:
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValidationError({"end_time": _("The end time must be after the start time.")})


class MinimumWage(UUIDModel):
    """The recommended minimum net hourly rate, effective from a date.

    Global (national URSSAF figure), managed in the admin so it can be updated —
    with history — as URSSAF re-indexes it. The API surfaces it as a soft warning.
    """

    effective_from = models.DateField(unique=True)
    net_hourly_rate = models.DecimalField(max_digits=6, decimal_places=2, validators=NON_NEGATIVE)

    class Meta:
        ordering: ClassVar[list[str]] = ["-effective_from"]

    def __str__(self) -> str:
        return f"{self.net_hourly_rate} € from {self.effective_from}"

    @classmethod
    def applicable_on(cls, on: date | None = None) -> Decimal | None:
        """The minimum net hourly rate in force on `on` (default today), or None."""
        on = on or timezone.localdate()
        row = cls.objects.filter(effective_from__lte=on).order_by("-effective_from").first()
        return row.net_hourly_rate if row else None
