from __future__ import annotations

from typing import TYPE_CHECKING, ClassVar

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from config.models import UUIDModel

from .contract import Contract


class ContractSchedule(UUIDModel):
    """An effective-dated weekly-schedule snapshot.

    Editing the schedule creates a NEW row (with its own blocks) rather than
    mutating the previous one, preserving the full history.

    The week here is the *nanny's*, shared by every family on the contract — not
    one family's slice of it. CCN 3239 art. 144.2 divides "les heures de travail
    du salarié" by a répartition the contracts agree, so the hours have to exist
    as one pool before anything can divide them. It is also what the overtime
    bands are counted against.

    There is no weeks-per-year: art. 146.1 mensualises a regular week on × 52,
    full stop. A genuinely *irregular* schedule is not mensualised at all
    (art. 146.2 — paid on the hours actually worked), which this model cannot
    express yet. See ``docs/shared-care-pay.md``.
    """

    contract = models.ForeignKey(Contract, on_delete=models.CASCADE, related_name="schedules")
    effective_from = models.DateField(default=timezone.localdate)
    # Set when corrected in place (see ContractTerms.edited).
    edited = models.BooleanField(default=False)
    # Who last wrote this snapshot (see ContractTerms.created_by).
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contract_schedules_created",
    )

    if TYPE_CHECKING:
        id: int
        contract_id: int
        blocks: models.Manager[ScheduleBlock]

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
