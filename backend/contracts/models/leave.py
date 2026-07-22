from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, ClassVar

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _

from config.models import UUIDModel
from contracts.models._common import NON_NEGATIVE
from contracts.models.contract import Contract


class Leave(UUIDModel):
    """The nanny's own absence under a contract — she does not work.

    Contract-wide, not per family: when the nanny is off, every family that would
    have had her that day loses their share of it. A family being away instead is
    not this — that is expressed by the children's presence windows.

    A flat record (unlike the effective-dated terms/schedule): a leave spans
    ``start_date``..``end_date`` with a single :class:`Portion`. Hourly leaves
    carry an ``hours`` count and are only allowed on an *unpaid* leave.

    An hourly leave has no time of day, so the deduction cannot know which
    children would have been there and prorates the day's aggregate shares
    instead. Optional start/end times were added here and then read by nothing,
    with a comment claiming they bought precision they never delivered; they are
    gone. Add them back when something actually segments the day — it is one
    column.

    An **unpaid**, a **sickness** and a **maternity** absence all deduct — the
    hours are not worked and the employer does not pay them (in sickness and
    maternity the nanny draws IJSS, and any maintien de salaire is a separate
    indemnity, not declared hours). *Paid* leave does not deduct: it is already
    inside the mensualised salary (52 weeks = 47 worked + 5 of paid leave), so
    deducting it would take it off the nanny twice — see ``docs/shared-care-pay.md``.
    """

    class LeaveType(models.TextChoices):
        PAID = "paid", _("Paid leave")
        UNPAID = "unpaid", _("Unpaid leave")
        SICKNESS = "sickness", _("Sickness leave")
        MATERNITY = "maternity", _("Maternity leave")

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
