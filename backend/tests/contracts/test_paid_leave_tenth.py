"""The congés-payés « rappel de 1/10 » domain.

No database — paid_leave_tenth.py is pure — so these are plain unit tests over
the brut comparison (art. L3141-24) and the net⇄brut conversion. The headline
case is the textbook particulier-employeur example: a nanny at 200 €/week who
takes her 5 weeks of congés is owed a 40 € rappel, because a tenth of her
52-week pay (1040 €) beats the 5 weeks of maintien (1000 €) she was already paid.
"""

from datetime import date, time
from decimal import Decimal
from uuid import uuid4

from contracts import paid_leave_tenth
from contracts.declarations import Block, FamilyResult, LeaveSpan, Schedule, Terms, band_week

PERIOD = (date(2025, 6, 1), date(2026, 5, 31))
MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY = 0, 1, 2, 3, 4


def reconcile(assiette_net, maintien_net, rate=Decimal("0"), maintien_taken=None):
    return paid_leave_tenth.reconcile_tenth(
        period_start=PERIOD[0],
        period_end=PERIOD[1],
        assiette_net=Decimal(assiette_net),
        maintien_net=Decimal(maintien_net),
        maintien_taken_net=None if maintien_taken is None else Decimal(maintien_taken),
        contribution_rate=Decimal(rate),
    )


# --- the textbook example ----------------------------------------------------


def test_the_200_a_week_case_owes_a_40_rappel():
    # 52 weeks × 200 = 10400 assiette; 5 weeks × 200 = 1000 maintien.
    result = reconcile(assiette_net=52 * 200, maintien_net=5 * 200)
    assert result.tenth_brut == Decimal("1040.00")
    assert result.maintien_brut == Decimal("1000.00")
    assert result.rappel_brut == Decimal("40.00")
    assert result.rappel_net == Decimal("40.00")


# --- the comparison ----------------------------------------------------------


def test_maintien_beating_the_tenth_owes_nothing():
    # A short, leave-light year: maintien already exceeds a tenth of the assiette.
    result = reconcile(assiette_net=5000, maintien_net=800)
    assert result.tenth_brut == Decimal("500.00")
    assert result.rappel_brut == Decimal("0.00")
    assert result.rappel_net == Decimal("0.00")


def test_variable_pay_swells_the_assiette_and_the_rappel():
    # Same base as the 200/week case but 2000 of overtime/holidays on top: the
    # tenth grows by a tenth of it (200), the maintien does not move.
    base = reconcile(assiette_net=52 * 200, maintien_net=5 * 200)
    withvar = reconcile(assiette_net=52 * 200 + 2000, maintien_net=5 * 200)
    assert withvar.tenth_brut - base.tenth_brut == Decimal("200.00")
    assert withvar.rappel_brut == base.rappel_brut + Decimal("200.00")


# --- brut vs net -------------------------------------------------------------


def test_the_rappel_reports_in_brut_and_declares_in_net():
    rate = Decimal("0.2188025")
    result = reconcile(assiette_net=52 * 200, maintien_net=5 * 200, rate=rate)
    # Reported figures are grossed up (art. L3141-24 says brute totale)...
    assert result.assiette_brut == paid_leave_tenth._money(Decimal(52 * 200) / (1 - rate))
    # ...but the declarable rappel comes back to net, and the winner is basis-
    # invariant: it is the same 40 € the rate-free case produced.
    assert result.rappel_net == Decimal("40.00")
    assert result.rappel_brut > result.rappel_net


def test_the_net_rappel_is_basis_invariant():
    without = reconcile(assiette_net=52 * 200, maintien_net=5 * 200, rate=0)
    withrate = reconcile(assiette_net=52 * 200, maintien_net=5 * 200, rate=Decimal("0.30"))
    assert without.rappel_net == withrate.rappel_net


# --- the assiette ------------------------------------------------------------


def family_result(
    *,
    net_salary=Decimal("0"),
    night_indemnity=Decimal("0"),
    holiday_majoration=Decimal("0"),
    benefits_in_kind_amount=Decimal("0"),
    transport_amount=Decimal("0"),
    mileage_amount=Decimal("0"),
):
    """A FamilyResult with the assiette-relevant fields set and the rest zeroed."""
    return FamilyResult(
        family_id=uuid4(),
        normal_hours=Decimal("0"),
        hours_25=Decimal("0"),
        hours_50=Decimal("0"),
        night_count=0,
        night_indemnity=night_indemnity,
        holiday_majoration=holiday_majoration,
        transport_amount=transport_amount,
        benefits_in_kind_amount=benefits_in_kind_amount,
        kilometers=Decimal("0"),
        mileage_amount=mileage_amount,
        net_salary=net_salary,
        total_amount=Decimal("0"),
        net_hourly_rate=Decimal("0"),
        night_presence_rate=Decimal("0"),
        mileage_rate=Decimal("0"),
        rate_periods=(),
        warnings=(),
    )


def test_assiette_sums_pay_and_excludes_frais():
    result = family_result(
        net_salary=Decimal("1000"),
        night_indemnity=Decimal("50"),
        holiday_majoration=Decimal("20"),
        benefits_in_kind_amount=Decimal("30"),
        # Frais — must NOT count toward the 1/10 base.
        transport_amount=Decimal("40"),
        mileage_amount=Decimal("60"),
    )
    assert paid_leave_tenth.assiette_of(result) == Decimal("1100")


# --- the maintien already paid -----------------------------------------------

FAMILY = uuid4()


def mornings_schedule(*weekdays):
    # 08:00–12:00 = 4h a day; at 10 €/h that is 40 € a day, 200 € a five-day week.
    return Schedule(
        effective_from=date(2020, 1, 1),
        blocks=tuple(Block(weekday=d, start=time(8, 0), end=time(12, 0)) for d in weekdays),
    )


def tenner_terms():
    return (Terms(effective_from=date(2020, 1, 1), net_hourly_rate=Decimal("10")),)


def banded(schedule, days):
    """The per-weekday banding for each of `days`, as the repo builds for the period.

    No children on the contract, so a day divides equally over the family list —
    which, for one family, is the whole day (the common single-employer case).
    """
    week = band_week(schedule, {}, "prorata", (FAMILY,))
    return {day: week for day in days}


def maintien(leaves, schedule, terms, dates, non_workable=frozenset()):
    return paid_leave_tenth.maintien_by_family(
        leaves=leaves,
        banded_by_date=banded(schedule, dates),
        terms=terms,
        non_workable=non_workable,
        family_ids=(FAMILY,),
        period_start=PERIOD[0],
        period_end=PERIOD[1],
        contract_start=date(2020, 1, 1),
        contract_end=None,
    )


WEEK = [date(2025, 7, d) for d in range(7, 12)]  # Mon 7 Jul → Fri 11 Jul 2025


def test_maintien_values_leave_days_at_the_base_rate():
    schedule = mornings_schedule(MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY)
    leave = LeaveSpan("paid", WEEK[0], WEEK[-1], "full_day")  # a Mon–Fri week
    assert maintien((leave,), schedule, tenner_terms(), WEEK)[FAMILY] == Decimal("200.00")


def test_maintien_ignores_a_day_the_nanny_does_not_work():
    schedule = mornings_schedule(MONDAY, TUESDAY, THURSDAY, FRIDAY)  # no Wednesday
    leave = LeaveSpan("paid", WEEK[0], WEEK[-1], "full_day")
    # Four 40 € days, the Wednesday costs nothing.
    assert maintien((leave,), schedule, tenner_terms(), WEEK)[FAMILY] == Decimal("160.00")


def test_maintien_halves_a_half_day():
    schedule = mornings_schedule(MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY)
    leave = LeaveSpan("paid", WEEK[0], WEEK[0], "half_day")  # one Monday, half
    assert maintien((leave,), schedule, tenner_terms(), WEEK)[FAMILY] == Decimal("20.00")


def test_maintien_skips_a_non_workable_holiday_in_the_span():
    schedule = mornings_schedule(MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY)
    leave = LeaveSpan("paid", WEEK[0], WEEK[-1], "full_day")
    non_workable = frozenset({WEEK[2]})  # the Wednesday is a jour férié chômé
    assert maintien((leave,), schedule, tenner_terms(), WEEK, non_workable)[FAMILY] == Decimal(
        "160.00"
    )


def test_maintien_ignores_unpaid_leave():
    schedule = mornings_schedule(MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY)
    leave = LeaveSpan("unpaid", WEEK[0], WEEK[-1], "full_day")
    assert maintien((leave,), schedule, tenner_terms(), WEEK)[FAMILY] == Decimal("0.00")


# --- maintien on the acquired entitlement (what the tenth is measured against) ------


def full_week():
    schedule = mornings_schedule(MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY)  # 20h/wk
    return band_week(schedule, {}, "prorata", (FAMILY,))


def test_maintien_entitlement_values_the_acquired_days_not_the_taken_ones():
    # 30 jours ouvrables acquired = 5 weeks; 20h/wk × 10 € = 200 €/wk → 1000 €. It does
    # not matter how much leave was actually taken — the salary already carries it.
    result = paid_leave_tenth.maintien_entitlement(
        Decimal("30"), full_week(), Decimal("10"), (FAMILY,)
    )
    assert result[FAMILY] == Decimal("1000.00")


def test_maintien_entitlement_prorates_a_partial_entitlement():
    # Half a year acquired → 15 jours ouvrables = 2.5 weeks → 500 €.
    result = paid_leave_tenth.maintien_entitlement(
        Decimal("15"), full_week(), Decimal("10"), (FAMILY,)
    )
    assert result[FAMILY] == Decimal("500.00")


def test_maintien_entitlement_is_zero_without_a_week_or_days():
    no_week = paid_leave_tenth.maintien_entitlement(Decimal("30"), None, Decimal("10"), (FAMILY,))
    no_days = paid_leave_tenth.maintien_entitlement(
        Decimal("0"), full_week(), Decimal("10"), (FAMILY,)
    )
    assert no_week[FAMILY] == Decimal("0")
    assert no_days[FAMILY] == Decimal("0")


# --- the indemnité compensatrice (leave acquired but not taken) ---------------------


def test_the_compensatrice_is_the_untaken_part_of_the_maintien():
    # Entitlement worth 1000, only 600 taken → 400 of leave not taken to cash out.
    result = reconcile(assiette_net=10400, maintien_net=1000, maintien_taken=600)
    assert result.compensatrice_net == Decimal("400.00")
    # The rappel is still measured on the full entitlement, unchanged by under-taking.
    assert result.rappel_net == Decimal("40.00")


def test_no_compensatrice_when_all_the_leave_was_taken():
    result = reconcile(assiette_net=10400, maintien_net=1000, maintien_taken=1000)
    assert result.compensatrice_net == Decimal("0.00")


def test_the_rappel_no_longer_balloons_when_leave_is_untaken():
    # The whole point of the entitlement basis: taking 0 weeks leaves the rappel at 40,
    # not at the full tenth. The untaken leave is the compensatrice, kept separate.
    untaken = reconcile(assiette_net=10400, maintien_net=1000, maintien_taken=0)
    assert untaken.rappel_net == Decimal("40.00")
    assert untaken.compensatrice_net == Decimal("1000.00")
