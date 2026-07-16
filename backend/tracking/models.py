from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, ClassVar

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
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
        "accounts.Child", through="ContractChild", related_name="contracts"
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
    # Hourly rate for "présence de nuit" (20:00–06:30), which URSSAF pays as a
    # flat indemnity rather than as worked hours. The parties agree the amount;
    # URSSAF only sets a floor of a quarter of net_hourly_rate, which the API
    # surfaces as a soft warning (like MinimumWage) rather than enforcing.
    night_presence_rate = models.DecimalField(
        max_digits=6, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )
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
    # Weeks of this shape per year, the second operand of the mensualisation
    # (weekly hours × weeks_per_year ÷ 12). 52 is a full year — 47 worked plus 5
    # of paid leave; an "année incomplète" agrees its own count. It lives on the
    # schedule rather than the terms so both operands of that product resolve
    # from one snapshot, cut on one effective_from.
    weeks_per_year = models.PositiveSmallIntegerField(
        default=52, validators=[MinValueValidator(1), MaxValueValidator(53)]
    )
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


class ContractChild(UUIDModel):
    """A child covered by a contract. The through model for `Contract.children`.

    Flat, not effective-dated: versioning presence would need a third snapshot
    level (set → child → window) inheriting the delete-and-recreate churn of
    ContractSchedule, for a shape whose UI is not settled yet. Safe only because
    a filed MonthlyDeclaration freezes its own numbers — see that model. Adding
    an ``effective_from`` later is a one-column migration backfilled to
    ``contract.starting_date``; the reverse would not be.
    """

    contract = models.ForeignKey(
        Contract, on_delete=models.CASCADE, related_name="contract_children"
    )
    child = models.ForeignKey(
        "accounts.Child", on_delete=models.CASCADE, related_name="contract_children"
    )

    if TYPE_CHECKING:
        contract_id: uuid.UUID
        child_id: uuid.UUID
        windows: RelatedManager[ContractChildWindow]

    class Meta:
        constraints: ClassVar[list] = [
            models.UniqueConstraint(fields=["contract", "child"], name="uniq_contract_child"),
        ]

    def __str__(self) -> str:
        return f"{self.child} on {self.contract}"

    def clean(self) -> None:
        # Nothing else stops attaching a child of a family that has no share in
        # the contract, and the damage is double: their hours would be routed to
        # a family that never employed the nanny, and the child's name would
        # surface in that family's declaration.
        if self.contract_id and self.child_id:
            family_id = self.child.family_id
            if not self.contract.shares.filter(family_id=family_id).exists():
                raise ValidationError(
                    {"child": _("This child's family does not share this contract.")}
                )


class ContractChildWindow(UUIDModel):
    """The hours of one weekday a :class:`ContractChild` is actually present.

    Optional, and the absence of any window is meaningful: a child with **no
    windows at all** is present whenever the nanny works, which is the common
    case. A child with *any* window is present only within the union of them —
    a test evaluated across every weekday, never within one. A child windowed
    Mon/Tue/Thu/Fri has no Wednesday window and is therefore absent on
    Wednesday; reading "no window *for this weekday*" as "present all day" would
    say the exact opposite.
    """

    contract_child = models.ForeignKey(
        ContractChild, on_delete=models.CASCADE, related_name="windows"
    )
    weekday = models.IntegerField(choices=ScheduleBlock.Weekday.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering: ClassVar[list[str]] = ["weekday", "start_time"]

    def __str__(self) -> str:
        return f"{self.get_weekday_display()} {self.start_time}–{self.end_time}"  # ty: ignore[unresolved-attribute]

    def clean(self) -> None:
        # Overlapping windows for one child are deliberately allowed: their union
        # is what counts, and the segmentation cuts on every boundary anyway.
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


class Leave(UUIDModel):
    """The nanny's own absence under a contract — she does not work.

    Contract-wide, not per family: when the nanny is off, every family that would
    have had her that day loses their share of it. A family being away instead is
    not this — that is expressed by the children's presence windows.

    A flat record (unlike the effective-dated terms/schedule): a leave spans
    ``start_date``..``end_date`` with a single :class:`Portion`. Hourly leaves
    carry an ``hours`` count and are only allowed on an *unpaid* leave.

    Only an **unpaid** leave deducts. Paid leave is already inside the
    mensualised salary (52 weeks = 47 worked + 5 of paid leave), so deducting it
    would take it off the nanny twice — see ``docs/shared-care-pay.md``.
    """

    class LeaveType(models.TextChoices):
        PAID = "paid", _("Paid leave")
        UNPAID = "unpaid", _("Unpaid leave")
        SICKNESS = "sickness", _("Sickness leave")

    class Portion(models.TextChoices):
        FULL_DAY = "full_day", _("Whole day")
        HALF_DAY = "half_day", _("Half day")
        HOURLY = "hourly", _("Hourly")

    contract = models.ForeignKey(Contract, on_delete=models.CASCADE, related_name="leaves")
    leave_type = models.CharField(max_length=20, choices=LeaveType.choices)
    start_date = models.DateField()
    end_date = models.DateField()
    portion = models.CharField(max_length=20, choices=Portion.choices, default=Portion.FULL_DAY)
    # Only meaningful (and only allowed) when portion == HOURLY, on an unpaid leave.
    hours = models.DecimalField(
        max_digits=4, decimal_places=2, null=True, blank=True, validators=NON_NEGATIVE
    )
    # Which hours of the day an hourly leave covers. Optional, and only on an
    # hourly leave. Without them `hours` is a bare count with no time of day, so
    # the deduction cannot be told which children would have been there and can
    # only fall back on the day's aggregate shares.
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="leaves_created",
    )

    if TYPE_CHECKING:
        contract_id: uuid.UUID

    class Meta:
        ordering: ClassVar[list[str]] = ["-start_date"]

    def __str__(self) -> str:
        return f"{self.get_leave_type_display()} {self.start_date}–{self.end_date}"  # ty: ignore[unresolved-attribute]

    def clean(self) -> None:
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValidationError(
                {"end_date": _("The ending date cannot be before the starting date.")}
            )
        if self.portion == self.Portion.HOURLY:
            if self.leave_type != self.LeaveType.UNPAID:
                raise ValidationError(
                    {"portion": _("Only unpaid leaves can be counted by the hour.")}
                )
            if self.hours is None:
                raise ValidationError({"hours": _("Give the number of hours for an hourly leave.")})
        elif self.hours is not None:
            raise ValidationError({"hours": _("Hours only apply to an hourly leave.")})
        if self.portion != self.Portion.HOURLY and (self.start_time or self.end_time):
            raise ValidationError({"start_time": _("Times only apply to an hourly leave.")})
        if bool(self.start_time) != bool(self.end_time):
            raise ValidationError({"end_time": _("Give both a start and an end time, or neither.")})
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValidationError({"end_time": _("The end time must be after the start time.")})


class BankHoliday(UUIDModel):
    """A national work-free day (jour férié). Global, admin-managed.

    Non-workable by default: the planning hides the nannies' working blocks on a
    non-workable holiday and shows the holiday name instead. ``is_workable=True``
    marks a holiday that is still worked (e.g. the journée de solidarité).

    Note this is a *planning* fact, not a pay one. A bank holiday must not touch
    the mensualised salary: a fixed × 52 ÷ 12 exists precisely so that the shape
    of a given calendar month does not matter. See ``docs/shared-care-pay.md``.
    """

    name = models.CharField(max_length=100)
    date = models.DateField(unique=True)
    is_workable = models.BooleanField(default=False)

    class Meta:
        ordering: ClassVar[list[str]] = ["date"]

    def __str__(self) -> str:
        return f"{self.name} ({self.date})"


class ExceptionalHours(UUIDModel):
    """Hours the nanny worked **beyond** the schedule, on one family's account.

    The nanny's day gets longer: a late night, an earlier start. Contrast
    :class:`ExceptionalPresence`, where she works exactly the same hours and only
    the split moves.

    Filed by one family, and read by all of them — family A's declared hours
    depend on whether B filed an overlapping entry, so both must see both. Where
    two families' entries overlap in time, that overlap divides by the contract's
    usual weight rule; the rest is wholly the filer's.

    Presence here is **who filed**, never the children's windows: those describe
    the regular week, and an exceptional entry is by definition irregular. A
    child windowed to 16:30–18:00 is "absent" at 19:00, so reading the windows
    would bill their family's own late night to the other family.

    Times are naive local `date` + `time`, deliberately: the project runs
    TIME_ZONE="UTC" with USE_TZ=True, so an aware 20:00 Paris would persist as
    18:00Z in summer and break the night-presence test twice a year.
    """

    class Kind(models.TextChoices):
        EFFECTIVE = "effective", _("Effective work")
        PRESENCE_RESPONSABLE = "presence_responsable", _("Responsible presence")
        NIGHT_PRESENCE = "night_presence", _("Night presence")

    contract = models.ForeignKey(
        Contract, on_delete=models.CASCADE, related_name="exceptional_hours"
    )
    # The family that needed these hours and will declare them.
    family = models.ForeignKey(
        "accounts.Family", on_delete=models.CASCADE, related_name="exceptional_hours"
    )
    kind = models.CharField(max_length=30, choices=Kind.choices, default=Kind.EFFECTIVE)
    start_date = models.DateField()
    start_time = models.TimeField()
    # end_date carries the night that runs past midnight; it is not always
    # start_date.
    end_date = models.DateField()
    end_time = models.TimeField()
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="exceptional_hours_created",
    )

    if TYPE_CHECKING:
        contract_id: uuid.UUID
        family_id: uuid.UUID

    class Meta:
        ordering: ClassVar[list[str]] = ["-start_date", "-start_time"]
        verbose_name_plural = "exceptional hours"
        constraints: ClassVar[list] = [
            models.CheckConstraint(
                condition=models.Q(end_date__gt=models.F("start_date"))
                | (
                    models.Q(end_date=models.F("start_date"))
                    & models.Q(end_time__gt=models.F("start_time"))
                ),
                name="exceptional_hours_end_after_start",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.get_kind_display()} {self.start_date} {self.start_time}–{self.end_time}"  # ty: ignore[unresolved-attribute]

    def clean(self) -> None:
        if self.contract_id and self.family_id:
            if not self.contract.shares.filter(family_id=self.family_id).exists():
                raise ValidationError({"family": _("This family does not share this contract.")})
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValidationError(
                {"end_date": _("The ending date cannot be before the starting date.")}
            )


class ExceptionalPresence(UUIDModel):
    """A child present on one date outside their usual window.

    The nanny works no longer than planned — she is already there for the others
    — so nothing is added to the hours. What moves is the *split*: a family with
    two children present where the schedule expected one now carries a larger
    share of that time. Contrast :class:`ExceptionalHours`.

    Overrides the child's :class:`ContractChildWindow` for this date only, and
    only within the nanny's scheduled hours; time outside them would mean she
    worked longer, which is an ExceptionalHours entry instead.
    """

    contract = models.ForeignKey(
        Contract, on_delete=models.CASCADE, related_name="exceptional_presences"
    )
    child = models.ForeignKey(
        "accounts.Child", on_delete=models.CASCADE, related_name="exceptional_presences"
    )
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="exceptional_presences_created",
    )

    if TYPE_CHECKING:
        contract_id: uuid.UUID
        child_id: uuid.UUID

    class Meta:
        ordering: ClassVar[list[str]] = ["-date", "start_time"]
        constraints: ClassVar[list] = [
            models.CheckConstraint(
                condition=models.Q(end_time__gt=models.F("start_time")),
                name="exceptional_presence_end_after_start",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.child} on {self.date} {self.start_time}–{self.end_time}"

    def clean(self) -> None:
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValidationError({"end_time": _("The end time must be after the start time.")})
        if self.contract_id and self.child_id:
            if not self.contract.contract_children.filter(child_id=self.child_id).exists():
                raise ValidationError({"child": _("This child is not covered by this contract.")})


class MonthlyDeclaration(UUIDModel):
    """What one family declares to pajemploi for one month.

    One row per (contract, family, month) — each family files its own, because
    pajemploi knows nothing of the other employer.

    A DRAFT is recomputed from live data whenever it is read. Filing freezes it:
    a FILED row is the record of what was actually declared and must never move
    again, whatever happens to the terms, the schedule or the children's windows
    afterwards. That freeze is what lets the presence models stay flat rather
    than effective-dated.

    ``rate_periods`` carries the per-period detail behind the totals. Almost
    every month has exactly one, and then the flat rate fields say everything;
    but a mid-month avenant makes total ≠ hours × rate, and without the detail
    nobody can reproduce the figure they are being asked to type.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", _("Draft")
        FILED = "filed", _("Filed")

    contract = models.ForeignKey(Contract, on_delete=models.CASCADE, related_name="declarations")
    family = models.ForeignKey(
        "accounts.Family", on_delete=models.CASCADE, related_name="declarations"
    )
    # Always the first of the month; the month is the unit, not the day.
    month = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)

    # --- the numbers pajemploi asks for -----------------------------------
    normal_hours = models.DecimalField(
        max_digits=6, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )
    hours_25 = models.DecimalField(
        max_digits=6, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )
    hours_50 = models.DecimalField(
        max_digits=6, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )
    total_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )

    # --- advantages -------------------------------------------------------
    # The contract's monthly lumps are for one nanny, so they are split by this
    # family's share of the month's hours rather than declared whole by each.
    transport_amount = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )
    benefits_in_kind_amount = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )
    # mileage_rate's missing operand: entered per family, per month.
    kilometers = models.DecimalField(
        max_digits=7, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )
    mileage_amount = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )

    # --- présence de nuit: an indemnity, not hours ------------------------
    night_count = models.PositiveSmallIntegerField(default=0)
    night_indemnity = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )

    # --- snapshot of the terms these numbers were priced with -------------
    # The rates in force on the month's LAST day: what the UI shows, and correct
    # whenever the month has a single terms snapshot (nearly always).
    net_hourly_rate = models.DecimalField(
        max_digits=6, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )
    night_presence_rate = models.DecimalField(
        max_digits=6, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )
    mileage_rate = models.DecimalField(
        max_digits=5, decimal_places=3, default=Decimal("0"), validators=NON_NEGATIVE
    )
    rate_periods = models.JSONField(default=list, blank=True)
    warnings = models.JSONField(default=list, blank=True)

    computed_at = models.DateTimeField(auto_now=True)
    filed_at = models.DateTimeField(null=True, blank=True)
    filed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    if TYPE_CHECKING:
        contract_id: uuid.UUID
        family_id: uuid.UUID

    class Meta:
        ordering: ClassVar[list[str]] = ["-month"]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["contract", "family", "month"], name="uniq_declaration_per_family_month"
            ),
            models.CheckConstraint(
                condition=models.Q(month__day=1), name="declaration_month_is_first_of_month"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.family} — {self.month:%B %Y} ({self.status})"

    @property
    def is_frozen(self) -> bool:
        """A filed declaration is a record; recomputing must leave it alone."""
        return self.status == self.Status.FILED

    def clean(self) -> None:
        if self.month and self.month.day != 1:
            raise ValidationError({"month": _("A declaration covers a whole month.")})
        if self.contract_id and self.family_id:
            if not self.contract.shares.filter(family_id=self.family_id).exists():
                raise ValidationError({"family": _("This family does not share this contract.")})
