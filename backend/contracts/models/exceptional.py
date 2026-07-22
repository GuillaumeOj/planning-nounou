from __future__ import annotations

import uuid
from datetime import time
from typing import TYPE_CHECKING, ClassVar

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _

from config.models import UUIDModel
from contracts.models.contract import Contract


def _within_night_window(start: time, end: time) -> bool:
    """Is a span inside the 20:00–06:30 présence de nuit window?

    The window wraps midnight, so "inside" means starting at or after 20:00, or
    ending by 06:30, or both. Widened by the 1h30 the parties may shift it by
    (art. 137.2) — the exact contractual window is not modelled, so this only
    catches an entry that is plainly daytime.
    """
    latest_start = time(18, 30)  # 20:00 brought forward by the full 1h30
    earliest_end = time(8, 0)  # 06:30 pushed back by the full 1h30
    return start >= latest_start or end <= earliest_end


class ExceptionalHours(UUIDModel):
    """Hours the nanny worked **beyond** the schedule, on one family's account.

    The nanny's day gets longer: a late night, an earlier start. Contrast
    :class:`ExceptionalPresence`, where she works exactly the same hours and only
    the split moves.

    An entry is **solo** (the default) or **shared** (:attr:`is_shared`), and that
    flag is the whole of one family's declaration no longer depending on the
    other's:

    * a *solo* entry is one family's own extra hour, and it pays the whole of it —
      its declared hours cannot move because of anything the other family filed;
    * a *shared* entry is care both families needed at once, and its filer declares
      only its own contractual share of it, again without reading the other's rows.
      Both families are expected to file their own (the app prompts the second),
      and then the shares sum to the whole; if one forgets, the nanny is short
      exactly that family's share and no other declaration is wrong.

    So a shared entry is read by all the families (the prompt needs to see it) and
    a solo one is the filer's alone. Neither reads the children's windows: those
    describe the *regular* week, and an exceptional entry is by definition
    irregular. See docs/shared-care-pay.md §3.1.

    Times are naive local `date` + `time`, deliberately: the project runs
    TIME_ZONE="UTC" with USE_TZ=True, so an aware 20:00 Paris would persist as
    18:00Z in summer and break the night-presence test twice a year.
    """

    class Kind(models.TextChoices):
        EFFECTIVE = "effective", _("Effective work")
        PRESENCE_RESPONSABLE = "presence_responsable", _("Responsible presence")
        NIGHT_PRESENCE = "night_presence", _("Night presence")

    #: Kinds a shared contract may not use. Présence responsable pays two thirds
    #: of an effective hour, and CCN 3239 art. 137.1 opens by excluding it from a
    #: garde partagée outright — so on a shared contract it is not a cheaper way
    #: to book an hour, it is an underpayment. URSSAF's own page lists it under
    #: "garde d'enfants à domicile" without the caveat because that page
    #: describes the job; the exclusion is a garde partagée rule. Allowed on a
    #: solo contract, hence a gate rather than a removal.
    SHARED_CARE_FORBIDDEN_KINDS: ClassVar[set[str]] = {Kind.PRESENCE_RESPONSABLE}

    contract = models.ForeignKey(
        Contract, on_delete=models.CASCADE, related_name="exceptional_hours"
    )
    # The family that needed these hours and will declare them.
    family = models.ForeignKey(
        "accounts.Family", on_delete=models.CASCADE, related_name="exceptional_hours"
    )
    kind = models.CharField(max_length=30, choices=Kind.choices, default=Kind.EFFECTIVE)
    # Care both families needed at once (split by the contract's usual rule) rather
    # than this family's own extra hour (which it pays whole). A shared entry is
    # visible to the other family so the app can prompt it to file its own.
    is_shared = models.BooleanField(default=False)
    start_date = models.DateField()
    start_time = models.TimeField()
    # end_date carries the night that runs past midnight; it is not always
    # start_date.
    end_date = models.DateField()
    end_time = models.TimeField()
    # How many times the nanny was woken (NIGHT_PRESENCE only). Not a statistic:
    # art. 137.2 raises the indemnity from a quarter of the equivalent salary to
    # a third from the second intervention onwards ("est portée à"), so a night
    # left at 0 here is priced a third cheaper than a night she was up twice for.
    interventions = models.PositiveSmallIntegerField(default=0)
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
        # One count for both shared-care checks below, rather than a query each.
        share_count = self.contract.shares.count() if self.contract_id else 0
        if self.contract_id and self.family_id:
            if not self.contract.shares.filter(family_id=self.family_id).exists():
                raise ValidationError({"family": _("This family does not share this contract.")})
        if share_count > 1 and self.kind in self.SHARED_CARE_FORBIDDEN_KINDS:
            raise ValidationError(
                {
                    "kind": _(
                        "Responsible presence hours are excluded in a shared care "
                        "arrangement (CCN 3239, art. 137.1). Record them as effective work."
                    )
                }
            )
        if self.is_shared and self.contract_id and share_count < 2:
            raise ValidationError(
                {
                    "is_shared": _(
                        "Only a shared-care contract has hours to share. Record these as "
                        "your family's own."
                    )
                }
            )
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValidationError(
                {"end_date": _("The ending date cannot be before the starting date.")}
            )
        if self.interventions and self.kind != self.Kind.NIGHT_PRESENCE:
            raise ValidationError(
                {"interventions": _("Interventions only apply to night presence.")}
            )
        if self.kind == self.Kind.NIGHT_PRESENCE and self.start_time and self.end_time:
            # The window is 20:00-06:30, which the parties may shift by up to
            # 1h30 in total (art. 137.2), so this is a soft outer bound rather
            # than the exact contractual window — which is not modelled yet.
            if not _within_night_window(self.start_time, self.end_time):
                raise ValidationError(
                    {
                        "start_time": _(
                            "Night presence runs between 20:00 and 06:30. Record daytime "
                            "hours as effective work."
                        )
                    }
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
        "children.Child", on_delete=models.CASCADE, related_name="exceptional_presences"
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
