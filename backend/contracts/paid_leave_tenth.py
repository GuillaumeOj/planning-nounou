"""The congés-payés « rappel de 1/10 »: what maintien de salaire may still owe.

Pure, Django-free domain logic, like :mod:`contracts.declarations` and
:mod:`contracts.paid_leave`. The ORM boundary is :mod:`contracts.declarations_repo`,
which aggregates a whole *année de référence* of monthly declarations and hands
the totals here.

**Why this exists.** The app pays paid leave by *maintien de salaire*: the
mensualised salary (52 = 47 worked + 5 of paid leave) is paid every month,
congés included, so a leave week is paid like a worked one and nothing is added
when leave is taken. That is one of the two lawful methods — but not on its own.
Art. L3141-24 makes the indemnité de congés payés the *more favourable* of maintien
and the **règle du 1/10**, and the shortfall is a real debt the employer settles
once a year (the « rappel de 1/10 », due by 31 May). A busy overtime year, worked
bank holidays, night presence or a mid-year raise all swell the 1/10 base without
touching the maintien already paid, so the tenth can — and often does — win.

**The comparison is in brut** (art. L3141-24 says *rémunération brute totale*), even
though the whole engine prices in net. One number crosses the line: the
cotisations-salariales rate (:class:`reference.models.SalaryContributionRate`),
with ``brut = net / (1 − rate)``. The winner is the same in either basis — every
term scales by the one factor — but the figures we *report* are the legal brut
ones, and the rappel is converted back to net to be declared to pajemploi.

**What goes in the 1/10 base** (the *assiette*, art. L3141-24): the salary for the
hours worked and their majorations, the worked-bank-holiday supplement, the night-
presence indemnity, benefits in kind, and — because the base is « brute totale » —
the mensualised congés pay already inside every month's salary. Reimbursements of
expenses (transport, kilométrage) are *frais professionnels*, not remuneration, and
stay out. Assembling that sum from the monthly results is the repo layer's job; this
module takes the total and the maintien already paid, and does the arithmetic.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction
from typing import TYPE_CHECKING

from contracts.declarations import (
    MINUTES_PER_HOUR,
    days_between,
    in_force,
)

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence
    from uuid import UUID

    from contracts.declarations import FamilyResult, LeaveSpan, Terms, WeekBands

#: art. L3141-24: the indemnité is a *tenth* of the gross reference-period pay.
TENTH = Decimal("0.10")
MONEY_QUANTUM = Decimal("0.01")
PAID_LEAVE_TYPE = "paid"
_FULL_DAY, _HALF_DAY = "full_day", "half_day"
#: 30 jours ouvrables of leave a year is 5 weeks — six ouvrables to a week.
JOURS_OUVRABLES_PER_WEEK = 6


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def assiette_of(result: FamilyResult) -> Decimal:
    """One family-month's contribution to the 1/10 base (art. L3141-24), in net.

    Everything that is *remuneration* for the work: the banded salary (which already
    carries the overtime majorations), the worked-bank-holiday supplement, the night-
    presence indemnity, and benefits in kind. Deliberately **not** the transport fee
    or the kilométrage — those reimburse expenses (*frais professionnels*) and are not
    pay, so they stay out of the assiette. Summed across a contract's families and its
    twelve months, this is the « rémunération brute totale » the tenth is a tenth of
    (the mensualised congés pay is already inside ``net_salary`` every month).
    """
    return (
        result.net_salary
        + result.night_indemnity
        + result.holiday_majoration
        + result.benefits_in_kind_amount
    )


@dataclass(frozen=True, slots=True)
class TenthReconciliation:
    """One contract's règle-du-1/10 standing for a reference period, in brut and net.

    ``rappel_net`` is the number that matters operationally — the top-up to declare
    to pajemploi — and it is zero whenever maintien de salaire already met or beat
    the tenth, which is the ordinary outcome for a quiet year.
    """

    period_start: date
    period_end: date
    #: Fraction of brut withheld as cotisations salariales, the net⇄brut factor.
    contribution_rate: Decimal
    #: The « rémunération brute totale » of the period — the 1/10 base (art. L3141-24).
    assiette_brut: Decimal
    #: A tenth of the assiette: the règle-du-1/10 indemnity.
    tenth_brut: Decimal
    #: The gross salary already paid for the paid-leave days taken (maintien).
    maintien_brut: Decimal
    #: max(0, tenth − maintien): the shortfall maintien still owes, in brut.
    rappel_brut: Decimal
    #: ``rappel_brut`` back in net — what actually gets declared and paid.
    rappel_net: Decimal
    #: Indemnité compensatrice: the maintien value of leave acquired but NOT taken
    #: (entitlement − taken), owed only when the contract ends. Brut and net.
    compensatrice_brut: Decimal
    compensatrice_net: Decimal


def net_to_brut(net: Decimal, contribution_rate: Decimal) -> Decimal:
    """Gross a net amount up: ``net / (1 − rate)``. Exact until the caller rounds."""
    return net / (Decimal("1") - contribution_rate)


def _portion_weight(portion: str) -> Fraction:
    """A scheduled day's weight for a paid leave's portion. Hourly is not paid leave."""
    if portion == _FULL_DAY:
        return Fraction(1)
    if portion == _HALF_DAY:
        return Fraction(1, 2)
    return Fraction(0)


def maintien_entitlement(
    accrued_days: Decimal,
    week: WeekBands | None,
    net_hourly_rate: Decimal,
    family_ids: Sequence[UUID],
) -> dict[UUID, Decimal]:
    """Per family: the maintien de salaire the mensualised pay already carries for the
    ACQUIRED leave — what the règle du 1/10 is really measured against.

    Not the leave *taken*. Under mensualisation (art. 146: 52 weeks = worked + leave)
    the salary pays the full acquired entitlement whether or not the nanny rests, so the
    tenth is compared to that. Measuring against days *taken* would inflate the rappel
    whenever leave is under-taken — paying for rest never taken, which the law forbids
    during the contract (untaken leave is lost, or paid as the indemnité compensatrice at
    the contract's end, never a bigger rappel). ``accrued_days`` is the entitlement earned
    so far this period in jours ouvrables; each family's weekly base salary is its share of
    the contractual week (``week.total``) at the base rate.
    """
    out: dict[UUID, Decimal] = {family_id: Decimal("0") for family_id in family_ids}
    if week is None or accrued_days <= 0:
        return out
    weeks = accrued_days / JOURS_OUVRABLES_PER_WEEK
    for family_id in family_ids:
        bands = week.total.get(family_id)
        if bands is None or not bands.total:
            continue
        weekly_hours = (
            Decimal(bands.total.numerator) / Decimal(bands.total.denominator) / MINUTES_PER_HOUR
        )
        out[family_id] = _money(weeks * weekly_hours * net_hourly_rate)
    return out


def maintien_by_family(
    leaves: Sequence[LeaveSpan],
    banded_by_date: Mapping[date, WeekBands],
    terms: Sequence[Terms],
    non_workable: frozenset[date],
    family_ids: Sequence[UUID],
    period_start: date,
    period_end: date,
    contract_start: date,
    contract_end: date | None,
) -> dict[UUID, Decimal]:
    """Per family: the net salary it already paid for the paid-leave days *taken*.

    Not what the tenth is measured against (that is the acquired entitlement, see
    :func:`maintien_entitlement`) — this is the taken portion, and the entitlement minus
    it is the indemnité compensatrice for leave not taken. Split the way every other hour
    on this contract is — by each family's share of the day (``banded_by_date`` is the
    same per-weekday banding the pay engine builds). Walked
    per date like :func:`paid_leave.taken_days`: a whole-day leave costs only the days
    the nanny works, a non-workable jour férié inside the span costs nothing, a half-day
    counts half. In shared care a shared paid-leave day divides between the families, so
    each declares its own rappel against its own maintien.

    Priced at the base rate, not banded into overtime: maintien restores the ordinary
    salary for the day, and an overtime week's habitual majoration is a second-order
    refinement left for when a real case needs it. With no terms in force a day
    contributes nothing rather than guessing a rate.
    """
    span_end = min(period_end, contract_end) if contract_end else period_end
    out: dict[UUID, Decimal] = {family_id: Decimal("0") for family_id in family_ids}
    for leave in leaves:
        if leave.leave_type != PAID_LEAVE_TYPE:
            continue
        weight = _portion_weight(leave.portion)
        if not weight:
            continue
        portion = Decimal(weight.numerator) / Decimal(weight.denominator)
        start = max(leave.start_date, period_start, contract_start)
        for day in days_between(start, min(leave.end_date, span_end)):
            if day in non_workable:
                continue
            week = banded_by_date.get(day)
            if week is None:
                continue
            row = in_force(terms, day)
            if row is None:
                continue
            for family_id, bands in week.by_weekday.get(day.weekday(), {}).items():
                minutes = bands.total  # a Fraction of minutes
                if not minutes:
                    continue
                hours = Decimal(minutes.numerator) / Decimal(minutes.denominator) / MINUTES_PER_HOUR
                out[family_id] = out.get(family_id, Decimal("0")) + (
                    hours * row.net_hourly_rate * portion
                )
    return {family_id: _money(value) for family_id, value in out.items()}


def reconcile_tenth(
    *,
    period_start: date,
    period_end: date,
    assiette_net: Decimal,
    maintien_net: Decimal,
    contribution_rate: Decimal,
    maintien_taken_net: Decimal | None = None,
) -> TenthReconciliation:
    """Compare the règle du 1/10 against the maintien already paid, in brut.

    ``assiette_net`` is the total net remuneration in the 1/10 base over the period
    (salary, majorations, night and holiday indemnities, benefits in kind — the
    mensualised congés pay is already inside it, and frais are already out).
    ``maintien_net`` is the maintien for the *acquired entitlement* the mensualised pay
    already carries (see :func:`maintien_entitlement`), i.e. what the tenth is measured
    against. Both are grossed up by the same ``contribution_rate`` so the comparison is
    the *rémunération brute totale* the article names; the rappel is brought back to net.

    ``maintien_taken_net`` is the maintien for the leave *actually taken*; the difference
    ``maintien_net − maintien_taken_net`` is the indemnité compensatrice — the value of
    leave acquired but not taken, owed when the contract ends. Left None it is treated as
    fully taken (no compensatrice), which is the right default for a running estimate.

    A negative rappel — maintien beat the tenth — is not a claw-back: it clamps to
    zero, exactly as « ne peut être inférieure » (art. L3141-24) reads the other way.
    """
    factor = Decimal("1") - contribution_rate
    assiette_brut = net_to_brut(assiette_net, contribution_rate)
    maintien_brut = net_to_brut(maintien_net, contribution_rate)
    tenth_brut = assiette_brut * TENTH
    rappel_brut = max(Decimal("0"), tenth_brut - maintien_brut)
    taken = maintien_net if maintien_taken_net is None else maintien_taken_net
    compensatrice_net = max(Decimal("0"), maintien_net - taken)
    compensatrice_brut = net_to_brut(compensatrice_net, contribution_rate)
    return TenthReconciliation(
        period_start=period_start,
        period_end=period_end,
        contribution_rate=contribution_rate,
        assiette_brut=_money(assiette_brut),
        tenth_brut=_money(tenth_brut),
        maintien_brut=_money(maintien_brut),
        rappel_brut=_money(rappel_brut),
        rappel_net=_money(rappel_brut * factor),
        compensatrice_brut=_money(compensatrice_brut),
        compensatrice_net=_money(compensatrice_net),
    )
