from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import ClassVar

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from config.models import UUIDModel

NON_NEGATIVE = [MinValueValidator(Decimal("0"))]


class EffectiveDatedReference(UUIDModel):
    """A single global reference value that takes effect from a date, kept with history.

    The value in force on a date is the latest row whose ``effective_from`` has
    passed — the same "latest snapshot ≤ date" shape ``_common.current_snapshot``
    applies per contract, here for admin-managed national figures. A change is a new
    dated row, so the old value is never lost. Subclasses add one value field and a
    typed ``applicable_on`` that reads it via :meth:`_row_on`.
    """

    effective_from = models.DateField(unique=True)

    class Meta:
        abstract = True
        ordering: ClassVar[list[str]] = ["-effective_from"]

    @classmethod
    def _row_on(cls, on: date | None = None):
        """The row in force on `on` (default today), or None."""
        on = on or timezone.localdate()
        return cls.objects.filter(effective_from__lte=on).order_by("-effective_from").first()


class MinimumWage(EffectiveDatedReference):
    """The recommended minimum net hourly rate, effective from a date.

    Global (national URSSAF figure), managed in the admin so it can be updated —
    with history — as URSSAF re-indexes it. The API surfaces it as a soft warning.
    """

    net_hourly_rate = models.DecimalField(max_digits=6, decimal_places=2, validators=NON_NEGATIVE)

    def __str__(self) -> str:
        return f"{self.net_hourly_rate} € from {self.effective_from}"

    @classmethod
    def applicable_on(cls, on: date | None = None) -> Decimal | None:
        """The minimum net hourly rate in force on `on` (default today), or None."""
        row = cls._row_on(on)
        return row.net_hourly_rate if row else None


class PaidLeaveAllowance(EffectiveDatedReference):
    """The default number of annual paid-leave days a new contract starts with.

    Global and admin-managed with history, like :class:`MinimumWage`: the contract
    form pre-fills its ``paid_leave_days`` from the value in force so a family does
    not have to know the figure, and can still override it. The branch's statutory
    entitlement is 30 jours ouvrables (garde d'enfants à domicile, CCN 3239). A new
    dated row records a change without losing what the old default was.
    """

    annual_days = models.PositiveSmallIntegerField()

    def __str__(self) -> str:
        return f"{self.annual_days} days from {self.effective_from}"

    @classmethod
    def applicable_on(cls, on: date | None = None) -> int | None:
        """The default paid-leave days in force on `on` (default today), or None."""
        row = cls._row_on(on)
        return row.annual_days if row else None


class SalaryContributionRate(EffectiveDatedReference):
    """The employee-side social-contribution rate (cotisations salariales), from a date.

    Global (national URSSAF figure for garde d'enfants à domicile), admin-managed
    with history like :class:`MinimumWage`, and re-indexed over time. The app prices
    everything in *net*, but the congés-payés « rappel de 1/10 » is a *brut*
    comparison (art. L3141-24), so it needs one number to cross the net⇄brut line:

        brut = net / (1 − rate)      net = brut × (1 − rate)

    ``rate`` is the fraction withheld from brut (e.g. ``0.2188025`` ≈ 21.88 %). A new
    dated row records a re-indexation without losing the old value.
    """

    #: Fraction of brut withheld as cotisations salariales, in [0, 1).
    rate = models.DecimalField(
        max_digits=9,
        decimal_places=7,
        validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("0.9999999"))],
    )

    def __str__(self) -> str:
        return f"{self.rate} from {self.effective_from}"

    @classmethod
    def applicable_on(cls, on: date | None = None) -> Decimal | None:
        """The cotisations-salariales rate in force on `on` (default today), or None."""
        row = cls._row_on(on)
        return row.rate if row else None

    @classmethod
    def net_to_brut(cls, net: Decimal, on: date | None = None) -> Decimal | None:
        """Gross a net amount up by the rate in force on `on`. None if no rate is set."""
        rate = cls.applicable_on(on)
        if rate is None:
            return None
        return net / (Decimal("1") - rate)


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
