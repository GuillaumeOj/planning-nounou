"""Where a contract's paid-leave (congés payés) balance comes from.

Pure, dependency-free domain logic, like :mod:`tracking.declarations`: nothing
here imports Django, so it can be tested without a database. The ORM boundary is
:mod:`tracking.declarations_repo`, which loads the schedules, the leaves and the
holidays and hands them over as the frozen dataclasses that module already
defines.

Three things worth knowing rather than discovering:

* **The reference period is 1 June–31 May**, the *année de référence* the branch
  uses for this sector (garde d'enfants à domicile / CCN 3239). Accrual and
  consumption are shown over the *same* current period, which is a deliberate
  simplification: the legal acquisition and *prise* windows differ, but a family
  dashboard wants one running balance, not two.

* **Accrual prorates the agreed annual days.** The contract stores an agreed
  ``paid_leave_days`` (often 25–30); a month worked earns ``paid_leave_days / 12``
  of it. This is the number the families settled on, spread evenly, rather than
  the statutory 2.5 jours ouvrables floor — which is a different figure the
  contract does not carry.

* **"Taken" counts the nanny's scheduled working days, not calendar days.** A
  whole-day paid leave Monday–Friday over a week she only works Mon/Tue/Thu is
  three days off her balance, not five; a non-workable jour férié inside the span
  is not a congé day either. A half-day portion counts as half. Only *paid*
  leaves touch this balance — an unpaid or sickness absence is not congés.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction
from typing import TYPE_CHECKING

from .declarations import Holiday, LeaveSpan, Schedule, days_between, in_force

if TYPE_CHECKING:
    from collections.abc import Sequence

#: The année de référence opens on 1 June.
REFERENCE_PERIOD_START_MONTH = 6
MONTHS_PER_YEAR = 12
#: Only paid leave draws down the congés-payés balance.
PAID_LEAVE_TYPE = "paid"
_FULL_DAY, _HALF_DAY = "full_day", "half_day"


@dataclass(frozen=True, slots=True)
class PaidLeaveBalance:
    """One contract's congés-payés standing for the current reference period."""

    period_start: date
    period_end: date
    #: The agreed annual entitlement (the contract's ``paid_leave_days``).
    total_days: Decimal
    #: Earned so far this period: the annual days prorated by months elapsed.
    accrued: Decimal
    #: Scheduled working days of *paid* leave falling in this period.
    taken: Decimal
    #: accrued − taken. May go negative when leave is booked ahead of accrual.
    remaining: Decimal


def reference_period(on: date) -> tuple[date, date]:
    """The 1 June–31 May année de référence containing ``on``."""
    start_year = on.year if on.month >= REFERENCE_PERIOD_START_MONTH else on.year - 1
    return date(start_year, 6, 1), date(start_year + 1, 5, 31)


def months_elapsed(start: date, on: date) -> int:
    """Whole months from ``start``'s month through ``on``'s, inclusive. Never < 0.

    June-to-June inclusive is one month, June-to-October is five — the count a
    parent means by "we are five months into the year".
    """
    count = (on.year - start.year) * MONTHS_PER_YEAR + (on.month - start.month) + 1
    return max(0, count)


def _to_half_days(value: Fraction) -> Decimal:
    """Round an exact day count to the nearest half-day, the unit leave is taken in."""
    halves = (Decimal(value.numerator) / Decimal(value.denominator) * 2).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )
    return halves / 2


def accrued_days(
    paid_leave_days: int, period_start: date, contract_start: date, on: date
) -> Decimal:
    """The agreed annual days earned so far this period, prorated by the month.

    Accrual starts at the later of the period's opening and the contract's start,
    so a contract signed mid-year does not claim months before it existed. Capped
    at the full entitlement — a period cannot earn more than a year's worth.
    """
    eff_start = max(period_start, contract_start)
    if on < eff_start:
        return Decimal("0")
    elapsed = min(MONTHS_PER_YEAR, months_elapsed(eff_start, on))
    exact = Fraction(paid_leave_days * elapsed, MONTHS_PER_YEAR)
    return _to_half_days(min(Fraction(paid_leave_days), exact))


def _portion_days(portion: str) -> Fraction:
    """A scheduled day's weight for a leave's portion. Hourly is not a paid leave."""
    if portion == _FULL_DAY:
        return Fraction(1)
    if portion == _HALF_DAY:
        return Fraction(1, 2)
    return Fraction(0)


def taken_days(
    leaves: Sequence[LeaveSpan],
    schedules: Sequence[Schedule],
    non_workable: frozenset[date],
    period_start: date,
    period_end: date,
    contract_start: date,
    contract_end: date | None,
) -> Decimal:
    """Scheduled working days of paid leave falling in the reference period.

    Walked per date — each day resolves its own weekday and its own schedule
    snapshot — so a whole-day leave costs only the days the nanny actually works,
    and a non-workable holiday inside the span costs nothing.
    """
    span_end = min(period_end, contract_end) if contract_end else period_end
    total = Fraction(0)
    for leave in leaves:
        if leave.leave_type != PAID_LEAVE_TYPE:
            continue
        weight = _portion_days(leave.portion)
        if not weight:
            continue
        start = max(leave.start_date, period_start, contract_start)
        for day in days_between(start, min(leave.end_date, span_end)):
            if day in non_workable:
                continue
            schedule = in_force(schedules, day)
            if schedule is None or not any(b.weekday == day.weekday() for b in schedule.blocks):
                continue
            total += weight
    return _to_half_days(total)


def compute_balance(
    *,
    paid_leave_days: int,
    contract_start: date,
    contract_end: date | None,
    schedules: Sequence[Schedule],
    leaves: Sequence[LeaveSpan],
    holidays: Sequence[Holiday],
    on: date,
) -> PaidLeaveBalance:
    """A contract's congés-payés balance for the reference period containing ``on``."""
    period_start, period_end = reference_period(on)
    non_workable = frozenset(h.day for h in holidays if not h.is_workable)
    accrued = accrued_days(paid_leave_days, period_start, contract_start, on)
    taken = taken_days(
        leaves,
        schedules,
        non_workable,
        period_start,
        period_end,
        contract_start,
        contract_end,
    )
    return PaidLeaveBalance(
        period_start=period_start,
        period_end=period_end,
        total_days=Decimal(paid_leave_days),
        accrued=accrued,
        taken=taken,
        remaining=accrued - taken,
    )
