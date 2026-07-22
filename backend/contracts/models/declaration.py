from __future__ import annotations

import calendar
import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, ClassVar

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from config.models import UUIDModel
from contracts.models._common import NON_NEGATIVE
from contracts.models.contract import Contract


class MonthlyDeclaration(UUIDModel):
    """What one family declares to pajemploi for one month.

    One row per (contract, family, month) — each family files its own, because
    pajemploi knows nothing of the other employer.

    A DRAFT is recomputed from live data whenever it is read. Filing records it
    as sent — but a mistake is usually spotted a payslip or two later, so a FILED
    row stays **editable in place for a grace window**: until the end of the month
    :attr:`EDIT_GRACE_MONTHS` after the one it covers, it recomputes and accepts
    edits like a draft. Past that window it truly freezes: the record of what was
    declared must never move again, whatever happens to the terms, the schedule or
    the children's windows afterwards. That final freeze is what lets the presence
    models stay flat rather than effective-dated.

    ``rate_periods`` carries the per-period detail behind the totals. Almost
    every month has exactly one, and then the flat rate fields say everything;
    but a mid-month avenant makes total ≠ hours × rate, and without the detail
    nobody can reproduce the figure they are being asked to type.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", _("Draft")
        FILED = "filed", _("Filed")

    #: A filed declaration stays editable until the end of the month this many
    #: months after the one it covers — long enough to fix a figure once URSSAF
    #: or a payslip surfaces the mistake, without leaving old months open forever.
    EDIT_GRACE_MONTHS: ClassVar[int] = 2

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
    # pajemploi's "salaire net": the declared hours priced, and nothing else.
    net_salary = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )
    # net_salary plus the night indemnity and any worked-holiday majoration — the
    # whole net wage due. The advantages below are their own pajemploi fields and
    # are deliberately NOT folded in here.
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

    # A worked jour férié owes 10% on top of the hours (100% on 1 May). The hours
    # themselves are already in the counts above, so this is a supplement, not a
    # fourth band.
    holiday_majoration = models.DecimalField(
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
    def editable_until(self) -> date:
        """Last day a filed declaration may still be changed: the end of the month
        ``EDIT_GRACE_MONTHS`` after the one it covers."""
        from contracts.declarations import first_of_month

        first = first_of_month(self.month, self.EDIT_GRACE_MONTHS)
        last_day = calendar.monthrange(first.year, first.month)[1]
        return first.replace(day=last_day)

    @property
    def is_editable(self) -> bool:
        """A draft is always editable; a filed row only until its grace window ends."""
        if self.status != self.Status.FILED:
            return True
        return timezone.localdate() <= self.editable_until

    @property
    def is_frozen(self) -> bool:
        """A filed declaration past its grace window is a record; recomputing must
        leave it alone. Within the window it recomputes and accepts edits."""
        return not self.is_editable

    def clean(self) -> None:
        if self.month and self.month.day != 1:
            raise ValidationError({"month": _("A declaration covers a whole month.")})
        if self.contract_id and self.family_id:
            if not self.contract.shares.filter(family_id=self.family_id).exists():
                raise ValidationError({"family": _("This family does not share this contract.")})
