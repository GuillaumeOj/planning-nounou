from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import ClassVar

from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from config.models import UUIDModel

NON_NEGATIVE = [MinValueValidator(Decimal("0"))]


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


class BankHoliday(UUIDModel):
    """A national work-free day (jour férié). Global, admin-managed.

    Non-workable by default: the planning hides the nannies' working blocks on a
    non-workable holiday and shows the holiday name instead. ``is_workable=True``
    marks a holiday that is still worked.

    A *chômé* holiday must not touch the mensualised salary — a fixed × 52 ÷ 12
    exists precisely so the shape of a calendar month does not matter, and it is
    already paid (art. 47.2, subject to the nanny having worked the days either
    side). A *worked* one is another matter: art. 47.2 owes a 10% majoration on
    the hours, and art. 47.1 owes 100% on 1 May. See ``docs/shared-care-pay.md``.
    """

    name = models.CharField(max_length=100)
    date = models.DateField(unique=True)
    is_workable = models.BooleanField(default=False)
    # The journée de solidarité is worked and earns no majoration — the hours are
    # owed, not bought. It is is_workable like any other worked holiday, so
    # without this flag it would collect art. 47.2's 10% and quietly invent money.
    # Not a national date: the parties choose it, so it is set by hand.
    is_solidarity = models.BooleanField(default=False)

    class Meta:
        ordering: ClassVar[list[str]] = ["date"]

    def __str__(self) -> str:
        return f"{self.name} ({self.date})"
