"""The paid-leave (congés payés) balance domain.

No database — paid_leave.py is pure, like declarations.py — so these are plain
unit tests over the reference period, the prorated accrual, and the "taken"
count that follows the nanny's actual working days rather than the calendar.
"""

from datetime import date, time
from decimal import Decimal

from tracking import paid_leave as pl
from tracking.declarations import Block, Holiday, LeaveSpan, Schedule

MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY = 0, 1, 2, 3, 4, 5


def weekdays_schedule(*weekdays, effective_from=date(2020, 1, 1)):
    return Schedule(
        effective_from=effective_from,
        blocks=tuple(Block(weekday=d, start=time(8, 0), end=time(18, 0)) for d in weekdays),
    )


def paid(start, end, portion="full_day"):
    return LeaveSpan(leave_type="paid", start_date=start, end_date=end, portion=portion)


# --- the reference period ----------------------------------------------------


def test_reference_period_after_june_opens_that_june():
    assert pl.reference_period(date(2026, 7, 17)) == (date(2026, 6, 1), date(2027, 5, 31))


def test_reference_period_before_june_opens_the_previous_june():
    assert pl.reference_period(date(2026, 3, 1)) == (date(2025, 6, 1), date(2026, 5, 31))


def test_reference_period_first_of_june_is_the_new_period():
    assert pl.reference_period(date(2026, 6, 1)) == (date(2026, 6, 1), date(2027, 5, 31))


def test_months_elapsed_counts_both_ends_inclusive():
    assert pl.months_elapsed(date(2026, 6, 1), date(2026, 6, 15)) == 1
    assert pl.months_elapsed(date(2026, 6, 1), date(2026, 10, 15)) == 5
    # A day before the start is not a month into the year.
    assert pl.months_elapsed(date(2026, 6, 1), date(2026, 5, 31)) == 0


# --- accrual -----------------------------------------------------------------


def test_accrual_prorates_the_agreed_days_by_the_month():
    # 30 days / 12 × 5 months = 12.5.
    accrued = pl.accrued_days(30, date(2026, 6, 1), date(2024, 1, 1), date(2026, 10, 15))
    assert accrued == Decimal("12.5")


def test_accrual_starts_at_the_contract_when_it_begins_mid_period():
    # Contract opens in September: September through November is three months.
    accrued = pl.accrued_days(30, date(2026, 6, 1), date(2026, 9, 10), date(2026, 11, 15))
    assert accrued == Decimal("7.5")


def test_accrual_is_capped_at_the_full_entitlement():
    accrued = pl.accrued_days(30, date(2026, 6, 1), date(2020, 1, 1), date(2027, 5, 20))
    assert accrued == Decimal("30")


def test_nothing_accrues_before_the_contract_starts():
    accrued = pl.accrued_days(30, date(2026, 6, 1), date(2026, 9, 1), date(2026, 7, 1))
    assert accrued == Decimal("0")


def test_accrual_rounds_to_the_nearest_half_day():
    # 25 / 12 × 5 = 10.4166… → 10.5.
    assert pl.accrued_days(25, date(2026, 6, 1), date(2024, 1, 1), date(2026, 10, 15)) == Decimal(
        "10.5"
    )


# --- taken -------------------------------------------------------------------


def test_taken_counts_only_scheduled_working_days():
    schedules = [weekdays_schedule(MONDAY, TUESDAY, THURSDAY, FRIDAY)]
    # A whole week off, but Wednesday is not worked, so four days come off.
    leave = paid(date(2026, 6, 15), date(2026, 6, 19))
    taken = pl.taken_days(
        [leave], schedules, frozenset(), date(2026, 6, 1), date(2027, 5, 31), date(2020, 1, 1), None
    )
    assert taken == Decimal("4")


def test_taken_ignores_the_weekend():
    schedules = [weekdays_schedule(MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY)]
    leave = paid(date(2026, 6, 20), date(2026, 6, 21))  # Sat–Sun
    taken = pl.taken_days(
        [leave], schedules, frozenset(), date(2026, 6, 1), date(2027, 5, 31), date(2020, 1, 1), None
    )
    assert taken == Decimal("0")


def test_taken_halves_a_half_day():
    schedules = [weekdays_schedule(MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY)]
    leave = paid(date(2026, 6, 15), date(2026, 6, 15), portion="half_day")
    taken = pl.taken_days(
        [leave], schedules, frozenset(), date(2026, 6, 1), date(2027, 5, 31), date(2020, 1, 1), None
    )
    assert taken == Decimal("0.5")


def test_taken_skips_a_non_workable_holiday_inside_the_leave():
    schedules = [weekdays_schedule(MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY)]
    leave = paid(date(2026, 6, 15), date(2026, 6, 19))
    # 18 June falls on a Thursday this week; take it out.
    taken = pl.taken_days(
        [leave],
        schedules,
        frozenset({date(2026, 6, 18)}),
        date(2026, 6, 1),
        date(2027, 5, 31),
        date(2020, 1, 1),
        None,
    )
    assert taken == Decimal("4")


def test_taken_ignores_unpaid_leave():
    schedules = [weekdays_schedule(MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY)]
    unpaid = LeaveSpan(
        leave_type="unpaid",
        start_date=date(2026, 6, 15),
        end_date=date(2026, 6, 19),
        portion="full_day",
    )
    taken = pl.taken_days(
        [unpaid],
        schedules,
        frozenset(),
        date(2026, 6, 1),
        date(2027, 5, 31),
        date(2020, 1, 1),
        None,
    )
    assert taken == Decimal("0")


def test_taken_clips_a_leave_to_the_period():
    schedules = [weekdays_schedule(MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY)]
    # Runs in from May (the previous period) into June: only the June days count.
    leave = paid(date(2026, 5, 28), date(2026, 6, 2))
    taken = pl.taken_days(
        [leave], schedules, frozenset(), date(2026, 6, 1), date(2027, 5, 31), date(2020, 1, 1), None
    )
    # 1 June is a Monday, 2 June a Tuesday → two working days in the period.
    assert taken == Decimal("2")


# --- the whole balance -------------------------------------------------------


def test_compute_balance_ties_accrual_and_consumption_together():
    schedules = [weekdays_schedule(MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY)]
    leaves = [paid(date(2026, 6, 15), date(2026, 6, 17))]  # Mon–Wed, 3 days
    holidays: list[Holiday] = []
    balance = pl.compute_balance(
        paid_leave_days=30,
        contract_start=date(2024, 1, 1),
        contract_end=None,
        schedules=schedules,
        leaves=leaves,
        holidays=holidays,
        on=date(2026, 10, 15),
    )
    assert balance.total_days == Decimal("30")
    assert balance.accrued == Decimal("12.5")
    assert balance.taken == Decimal("3")
    assert balance.remaining == Decimal("9.5")
