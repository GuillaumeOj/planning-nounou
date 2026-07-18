"""The pay domain: segmentation, banding, splitting, rounding.

No database — declarations.py is pure, so these are plain unit tests. This is
where the edge cases belong; the API tests only check the wiring.
"""

from datetime import date, time
from decimal import Decimal
from fractions import Fraction
from uuid import UUID, uuid4

import pytest

from tracking import declarations as d

FAMILY_A = UUID("aaaaaaaa-0000-0000-0000-000000000001")
FAMILY_B = UUID("bbbbbbbb-0000-0000-0000-000000000002")

MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY = 0, 1, 2, 3, 4


def child(family_id, *windows, child_id=None):
    return d.ChildPresence(
        child_id=child_id or uuid4(),
        family_id=family_id,
        windows=tuple(d.Window(day, start, end) for day, start, end in windows),
    )


def by_id(*children):
    return {c.child_id: c for c in children}


def block(weekday=MONDAY, start=time(8, 0), end=time(18, 0)):
    return d.Block(weekday=weekday, start=start, end=end)


def schedule(*blocks, effective_from=date(2026, 1, 1)):
    return d.Schedule(effective_from=effective_from, blocks=tuple(blocks))


def terms(rate="12.00", effective_from=date(2026, 1, 1), **kwargs):
    return d.Terms(
        effective_from=effective_from,
        net_hourly_rate=Decimal(rate),
        **{k: Decimal(v) if isinstance(v, str) else v for k, v in kwargs.items()},
    )


# --- presence ----------------------------------------------------------------


def test_a_child_with_no_window_is_always_present():
    assert d.presence_on(child(FAMILY_A), date(2026, 7, 13)) is None


def test_windows_are_read_across_weekdays_not_within_one():
    # The Wednesday case: windows Mon/Tue/Thu/Fri and nothing on Wednesday means
    # absent on Wednesday. Reading "no window *for this weekday*" as "present all
    # day" would say the exact opposite, which is the whole point of the design.
    kid = child(
        FAMILY_B,
        (MONDAY, time(8, 0), time(18, 0)),
        (TUESDAY, time(8, 0), time(18, 0)),
        (THURSDAY, time(8, 0), time(18, 0)),
        (FRIDAY, time(8, 0), time(18, 0)),
    )
    assert d.presence_on(kid, date(2026, 7, 15)) == ()  # a Wednesday: absent
    assert d.presence_on(kid, date(2026, 7, 13)) != ()  # a Monday: there


def test_an_override_adds_presence_for_one_date_only():
    kid = child(FAMILY_A, (MONDAY, time(16, 30), time(18, 0)))
    override = d.PresenceOverride(kid.child_id, date(2026, 7, 13), time(8, 0), time(12, 0))
    assert d.presence_on(kid, date(2026, 7, 13), [override]) == (
        d.Interval(time(8, 0), time(12, 0)),
        d.Interval(time(16, 30), time(18, 0)),
    )
    # A different Monday keeps the regular window.
    assert d.presence_on(kid, date(2026, 7, 20)) == (d.Interval(time(16, 30), time(18, 0)),)


def test_covers_needs_the_whole_segment_not_just_its_start():
    intervals = (d.Interval(time(8, 0), time(12, 0)),)
    assert d.covers(intervals, time(9, 0), time(10, 0))
    assert not d.covers(intervals, time(11, 0), time(13, 0))


# --- segmentation ------------------------------------------------------------


def test_a_window_reaching_past_the_block_does_not_cut_a_phantom_segment():
    kid = child(FAMILY_A, (MONDAY, time(16, 30), time(19, 0)))
    segments = d.segment_block(block(), {kid.child_id: d.presence_on(kid, date(2026, 7, 13))})
    assert [(s.start, s.end) for s in segments] == [
        (time(8, 0), time(16, 30)),
        (time(16, 30), time(18, 0)),
    ]


def test_a_window_matching_the_block_exactly_yields_one_segment():
    kid = child(FAMILY_A, (MONDAY, time(8, 0), time(18, 0)))
    segments = d.segment_block(block(), {kid.child_id: d.presence_on(kid, date(2026, 7, 13))})
    assert len(segments) == 1
    assert segments[0].present == {kid.child_id}


def test_overlapping_windows_for_one_child_merge_into_one_segment():
    kid = child(FAMILY_A, (MONDAY, time(8, 0), time(12, 0)), (MONDAY, time(10, 0), time(14, 0)))
    segments = d.segment_block(block(), {kid.child_id: d.presence_on(kid, date(2026, 7, 13))})
    assert [(s.start, s.end, bool(s.present)) for s in segments] == [
        (time(8, 0), time(14, 0), True),
        (time(14, 0), time(18, 0), False),
    ]


def test_segments_always_cover_the_whole_block():
    kid = child(FAMILY_A, (MONDAY, time(9, 0), time(17, 0)))
    segments = d.segment_block(block(), {kid.child_id: d.presence_on(kid, date(2026, 7, 13))})
    assert sum(s.minutes for s in segments) == 10 * 60


# --- weights -----------------------------------------------------------------


def test_no_child_present_falls_back_to_an_equal_split():
    # Not a defensive branch: a contract with no children listed takes this for
    # every segment, which is how the feature stays additive.
    weights = d.segment_weights(frozenset(), {}, "by_children", [FAMILY_A, FAMILY_B])
    assert weights == {FAMILY_A: Fraction(1, 2), FAMILY_B: Fraction(1, 2)}


def test_a_solo_contract_never_divides_by_zero():
    assert d.segment_weights(frozenset(), {}, "equal", [FAMILY_A]) == {FAMILY_A: Fraction(1)}


def test_equal_counts_families_present_not_families_on_the_contract():
    # The Wednesday case: B's child is absent, so A pays the lot. Counting every
    # family on the contract would hand B half a day their child never attended.
    a = child(FAMILY_A)
    children = by_id(a, child(FAMILY_B))
    weights = d.segment_weights(frozenset({a.child_id}), children, "equal", [FAMILY_A, FAMILY_B])
    assert weights == {FAMILY_A: Fraction(1), FAMILY_B: Fraction(0)}


def test_by_children_weighs_each_family_by_its_children_present():
    a1, a2, b1 = child(FAMILY_A), child(FAMILY_A), child(FAMILY_B)
    children = by_id(a1, a2, b1)
    present = frozenset({a1.child_id, a2.child_id, b1.child_id})
    weights = d.segment_weights(present, children, "by_children", [FAMILY_A, FAMILY_B])
    assert weights == {FAMILY_A: Fraction(2, 3), FAMILY_B: Fraction(1, 3)}


def test_the_same_families_split_equally_when_they_agreed_to():
    a1, a2, b1 = child(FAMILY_A), child(FAMILY_A), child(FAMILY_B)
    children = by_id(a1, a2, b1)
    present = frozenset({a1.child_id, a2.child_id, b1.child_id})
    weights = d.segment_weights(present, children, "equal", [FAMILY_A, FAMILY_B])
    assert weights == {FAMILY_A: Fraction(1, 2), FAMILY_B: Fraction(1, 2)}


def test_weights_always_sum_to_one():
    a1, a2, b1 = child(FAMILY_A), child(FAMILY_A), child(FAMILY_B)
    children = by_id(a1, a2, b1)
    for method in ("equal", "by_children"):
        for present in (
            frozenset({a1.child_id}),
            frozenset({a1.child_id, b1.child_id}),
            frozenset({a1.child_id, a2.child_id, b1.child_id}),
            frozenset(),
        ):
            weights = d.segment_weights(present, children, method, [FAMILY_A, FAMILY_B])
            assert sum(weights.values()) == 1


# --- the documented worked example -------------------------------------------


def test_the_after_school_child_shifts_the_split_mid_day():
    # docs/shared-care-pay.md §2: A has kid1 all day + kid2 from 16:30; B has one
    # kid all day. 08:00-16:30 is 50/50, 16:30-18:00 is 2/3-1/3, and the two
    # families' hours sum to the 10h the nanny actually worked.
    a1 = child(FAMILY_A)
    a2 = child(FAMILY_A, (MONDAY, time(16, 30), time(18, 0)))
    b1 = child(FAMILY_B)
    children = by_id(a1, a2, b1)
    week = d.band_week(schedule(block()), children, "by_children", [FAMILY_A, FAMILY_B])

    assert d.to_hours(week.total[FAMILY_A].total) == Decimal("5.25")
    assert d.to_hours(week.total[FAMILY_B].total) == Decimal("4.75")
    assert week.total[FAMILY_A].total + week.total[FAMILY_B].total == 10 * 60


# --- banding -----------------------------------------------------------------


def test_the_week_is_banded_before_it_is_split():
    # The ruling. A 45h week is 40 normal + 5 at 25%, and each band is then
    # shared. Splitting first would leave both families under 40h and the
    # majoration would silently vanish.
    a = child(FAMILY_A)
    b = child(FAMILY_B)
    blocks = [block(day, time(8, 0), time(17, 0)) for day in range(5)]  # 9h x 5 = 45h
    week = d.band_week(schedule(*blocks), by_id(a, b), "equal", [FAMILY_A, FAMILY_B])

    combined = week.total[FAMILY_A] + week.total[FAMILY_B]
    assert combined.normal == d.WEEKLY_NORMAL_MINUTES
    assert combined.at_25 == 5 * 60
    assert combined.at_50 == 0
    # And each family carries half of each band, rather than 22.5h of nothing.
    assert week.total[FAMILY_A].at_25 == Fraction(5 * 60, 2)


def test_the_50_percent_band_opens_after_eight_overtime_hours():
    assert d.allocate_bands(0, 50 * 60) == [
        (d.BAND_NORMAL, 40 * 60),
        (d.BAND_25, 8 * 60),
        (d.BAND_50, 2 * 60),
    ]


def test_a_week_under_the_threshold_is_all_normal():
    assert d.allocate_bands(0, 35 * 60) == [(d.BAND_NORMAL, 35 * 60)]


# --- mensualisation ----------------------------------------------------------


def test_mensualisation_spreads_the_week_over_twelve_months():
    # art. 146.1: hebdomadaire x 52 / 12. 52 is flat — there is no annee
    # incomplete for a garde d'enfants a domicile.
    bands = d.Bands(normal=Fraction(40 * 60))
    assert d.to_hours(d.mensualise(bands).normal) == Decimal("173.33")


# --- sub-periods -------------------------------------------------------------


def test_a_month_with_one_snapshot_is_one_period_weighing_the_whole_month():
    data = d.ContractMonth(
        month=date(2026, 7, 1),
        starting_date=date(2026, 1, 5),
        ending_date=None,
        split_method="equal",
        family_ids=(FAMILY_A,),
        children=(),
        schedules=(schedule(block()),),
        terms=(terms(),),
    )
    periods = d.sub_periods(data)
    assert len(periods) == 1
    assert periods[0].weight == 1


def test_a_mid_month_raise_cuts_the_month_and_the_weights_still_sum_to_one():
    data = d.ContractMonth(
        month=date(2026, 7, 1),
        starting_date=date(2026, 1, 5),
        ending_date=None,
        split_method="equal",
        family_ids=(FAMILY_A,),
        children=(),
        schedules=(schedule(block()),),
        terms=(terms(), terms("13.00", effective_from=date(2026, 7, 16))),
    )
    periods = d.sub_periods(data)
    assert [(p.start, p.end) for p in periods] == [
        (date(2026, 7, 1), date(2026, 7, 15)),
        (date(2026, 7, 16), date(2026, 7, 31)),
    ]
    assert sum(p.weight for p in periods) == 1


def test_a_contract_starting_mid_month_is_weighed_against_the_calendar_month():
    data = d.ContractMonth(
        month=date(2026, 7, 1),
        starting_date=date(2026, 7, 16),
        ending_date=None,
        split_method="equal",
        family_ids=(FAMILY_A,),
        children=(),
        schedules=(schedule(block()),),
        terms=(terms(),),
    )
    # 16 of July's 31 days, not a whole month.
    assert sum(p.weight for p in d.sub_periods(data)) == Fraction(16, 31)


def test_a_month_before_the_contract_starts_yields_nothing():
    data = d.ContractMonth(
        month=date(2025, 7, 1),
        starting_date=date(2026, 1, 5),
        ending_date=None,
        split_method="equal",
        family_ids=(FAMILY_A,),
        children=(),
        schedules=(),
        terms=(),
    )
    assert d.sub_periods(data) == []


# --- exceptional hours -------------------------------------------------------


EQUAL_SHARES = {FAMILY_A: Fraction(1, 2), FAMILY_B: Fraction(1, 2)}


def test_a_solo_entry_is_wholly_its_filers():
    # A family's own extra hour is paid in full — nothing the other family does
    # can move that number.
    entry = d.ExceptionalEntry(
        FAMILY_A, "effective", date(2026, 7, 14), time(20, 0), date(2026, 7, 14), time(23, 0)
    )
    minutes = d.attribute_exceptional([entry], EQUAL_SHARES, [FAMILY_A, FAMILY_B])
    assert minutes == {FAMILY_A: Fraction(3 * 60)}


def test_a_family_filing_overlapping_solo_entries_is_not_paid_for_both():
    entries = [
        d.ExceptionalEntry(
            FAMILY_A, "effective", date(2026, 7, 14), time(19, 0), date(2026, 7, 14), time(21, 0)
        ),
        d.ExceptionalEntry(
            FAMILY_A, "effective", date(2026, 7, 14), time(20, 0), date(2026, 7, 14), time(22, 0)
        ),
    ]
    minutes = d.attribute_exceptional(entries, EQUAL_SHARES, [FAMILY_A, FAMILY_B])
    assert minutes[FAMILY_A] == 3 * 60  # 19:00-22:00 unioned, not 4h


def test_a_shared_entry_takes_only_its_filers_contractual_share():
    # Care both families needed at once: A declares its own half of it, without
    # reading whether B filed anything.
    entry = d.ExceptionalEntry(
        FAMILY_A,
        "effective",
        date(2026, 7, 14),
        time(20, 0),
        date(2026, 7, 14),
        time(22, 0),
        is_shared=True,
    )
    minutes = d.attribute_exceptional([entry], EQUAL_SHARES, [FAMILY_A, FAMILY_B])
    assert minutes == {FAMILY_A: Fraction(60)}  # half of the 2h


def test_both_families_filing_a_matching_shared_entry_sum_to_the_whole():
    entries = [
        d.ExceptionalEntry(
            FAMILY_A,
            "effective",
            date(2026, 7, 14),
            time(20, 0),
            date(2026, 7, 14),
            time(22, 0),
            is_shared=True,
        ),
        d.ExceptionalEntry(
            FAMILY_B,
            "effective",
            date(2026, 7, 14),
            time(20, 0),
            date(2026, 7, 14),
            time(22, 0),
            is_shared=True,
        ),
    ]
    minutes = d.attribute_exceptional(entries, EQUAL_SHARES, [FAMILY_A, FAMILY_B])
    assert minutes[FAMILY_A] == 60
    assert minutes[FAMILY_B] == 60
    assert sum(minutes.values()) == 2 * 60  # the nanny is paid the 2h once


def test_a_shared_entry_splits_by_children_when_the_contract_says_so():
    a1, a2 = child(FAMILY_A), child(FAMILY_A)
    b1 = child(FAMILY_B)
    children = by_id(a1, a2, b1)
    shares = d.contract_shares(children, "by_children", [FAMILY_A, FAMILY_B])
    entry = d.ExceptionalEntry(
        FAMILY_A,
        "effective",
        date(2026, 7, 14),
        time(20, 0),
        date(2026, 7, 14),
        time(23, 0),
        is_shared=True,
    )
    minutes = d.attribute_exceptional([entry], shares, [FAMILY_A, FAMILY_B])
    assert minutes == {FAMILY_A: Fraction(2, 3) * 3 * 60}  # A weighs 2 of 3 children


def test_solo_entries_never_read_the_childrens_windows():
    # A's child is windowed to the afternoon; a solo entry is still wholly A's,
    # because presence for exceptional hours is who filed, never the windows.
    a = child(FAMILY_A, (TUESDAY, time(16, 30), time(18, 0)))
    b = child(FAMILY_B)
    shares = d.contract_shares(by_id(a, b), "equal", [FAMILY_A, FAMILY_B])
    entry = d.ExceptionalEntry(
        FAMILY_A, "effective", date(2026, 7, 14), time(19, 0), date(2026, 7, 14), time(21, 0)
    )
    minutes = d.attribute_exceptional([entry], shares, [FAMILY_A, FAMILY_B])
    assert minutes == {FAMILY_A: Fraction(2 * 60)}


def test_a_night_crossing_midnight_is_one_span():
    entries = [
        d.ExceptionalEntry(
            FAMILY_A,
            "night_presence",
            date(2026, 7, 14),
            time(22, 0),
            date(2026, 7, 15),
            time(2, 0),
        )
    ]
    minutes = d.attribute_exceptional(entries, {FAMILY_A: Fraction(1)}, [FAMILY_A])
    assert minutes[FAMILY_A] == 4 * 60


# --- rounding ----------------------------------------------------------------


def test_apportion_parts_sum_to_the_whole():
    # The float trap: 10h split three ways rounds to 3.33 each and loses a cent.
    parts = d.apportion(Decimal("10"), [Fraction(1, 3)] * 3)
    assert sum(parts) == Decimal("10")
    assert sorted(parts) == [Decimal("3.33"), Decimal("3.33"), Decimal("3.34")]


def test_apportion_handles_a_single_share():
    assert d.apportion(Decimal("40"), [Fraction(1)]) == [Decimal("40")]


def test_apportion_with_no_weight_pays_nobody():
    assert d.apportion(Decimal("40"), [Fraction(0), Fraction(0)]) == [Decimal("0"), Decimal("0")]


@pytest.mark.parametrize("total", ["10", "0.01", "173.33", "1000"])
def test_apportion_never_invents_or_loses_money(total):
    parts = d.apportion(Decimal(total), [Fraction(1, 7), Fraction(3, 7), Fraction(3, 7)])
    assert sum(parts) == Decimal(total)


# --- the whole month ---------------------------------------------------------


def month(*, children=(), schedules=None, terms_=None, split="equal", families=(FAMILY_A,), **kw):
    return d.ContractMonth(
        month=date(2026, 7, 1),
        starting_date=date(2026, 1, 5),
        ending_date=None,
        split_method=split,
        family_ids=families,
        children=children,
        schedules=schedules
        if schedules is not None
        else (schedule(*[block(i) for i in range(5)]),),
        terms=terms_ if terms_ is not None else (terms(),),
        **kw,
    )


def test_a_solo_forty_hour_week_mensualises_to_the_urssaf_figure():
    # 8h x 5 days = 40h; 40 x 52 / 12 = 173.33h, rounded UP to the 174h declared,
    # all normal, at 12 EUR -> 2088.00.
    blocks = [block(day, time(9, 0), time(17, 0)) for day in range(5)]
    result = d.compute_month(month(schedules=(schedule(*blocks),)))[FAMILY_A]
    assert result.normal_hours == Decimal("174")
    assert result.hours_25 == Decimal("0")
    assert result.net_salary == Decimal("2088.00")
    assert result.total_amount == Decimal("2088.00")


def test_a_shared_month_declares_at_least_what_the_nanny_worked():
    # The declared hours round UP, per family, so together they never fall short
    # of what she worked — the ceiling errs in her favour.
    a1 = child(FAMILY_A)
    a2 = child(FAMILY_A, *[(day, time(16, 30), time(18, 0)) for day in range(5)])
    b1 = child(FAMILY_B)
    results = d.compute_month(
        month(children=(a1, a2, b1), split="by_children", families=(FAMILY_A, FAMILY_B))
    )
    declared = sum(r.normal_hours + r.hours_25 + r.hours_50 for r in results.values())
    # 10h x 5 = 50h/week -> 40 normal + 8 at 25% + 2 at 50%, mensualised.
    worked = d.to_hours(d.mensualise(d.Bands(Fraction(50 * 60))).normal)
    assert declared >= worked
    # A carries more than B, because A's second child is there after school.
    assert results[FAMILY_A].normal_hours >= results[FAMILY_B].normal_hours


def test_the_overtime_bands_survive_the_split():
    a, b = child(FAMILY_A), child(FAMILY_B)
    blocks = [block(day, time(8, 0), time(17, 0)) for day in range(5)]  # 45h
    results = d.compute_month(
        month(children=(a, b), schedules=(schedule(*blocks),), families=(FAMILY_A, FAMILY_B))
    )
    # Splitting first would leave 22.5h each, all normal, and no majoration.
    assert results[FAMILY_A].hours_25 > 0
    assert results[FAMILY_B].hours_25 > 0


def test_unpaid_leave_prorates_the_month_rather_than_subtracting_the_day():
    # art. 152.1's "heures reelles": salaire mensualise x heures reellement
    # effectuees / heures qui auraient du l'etre. July 2026 has 23 working days,
    # so a planned 184h; one 8h day off leaves 176/184 of a 173.33h base = 165.80.
    # Subtracting the day's 8h outright would give 165.33 — close enough to look
    # right, and wrong in a way that compounds into February declaring hours for a
    # month worked none of.
    blocks = [block(day, time(9, 0), time(17, 0)) for day in range(5)]
    leave = d.LeaveSpan("unpaid", date(2026, 7, 13), date(2026, 7, 13), "full_day")
    without = d.compute_month(month(schedules=(schedule(*blocks),)))[FAMILY_A]
    with_leave = d.compute_month(month(schedules=(schedule(*blocks),), leaves=(leave,)))[FAMILY_A]
    # 173.33h and 165.80h before the ceiling; 174h and 166h once rounded up.
    assert without.normal_hours == Decimal("174")
    assert with_leave.normal_hours == Decimal("166")


def test_paid_leave_deducts_nothing_because_the_base_already_holds_it():
    # 52 weeks = 47 worked + 5 of paid leave. Deducting would take it twice.
    leave = d.LeaveSpan("paid", date(2026, 7, 13), date(2026, 7, 17), "full_day")
    without = d.compute_month(month())[FAMILY_A]
    with_leave = d.compute_month(month(leaves=(leave,)))[FAMILY_A]
    assert with_leave.normal_hours == without.normal_hours


def test_leave_on_a_day_the_nanny_never_works_deducts_nothing():
    blocks = [block(MONDAY, time(9, 0), time(17, 0))]  # Mondays only
    leave = d.LeaveSpan("unpaid", date(2026, 7, 14), date(2026, 7, 14), "full_day")  # a Tuesday
    without = d.compute_month(month(schedules=(schedule(*blocks),)))[FAMILY_A]
    with_leave = d.compute_month(month(schedules=(schedule(*blocks),), leaves=(leave,)))[FAMILY_A]
    assert with_leave.normal_hours == without.normal_hours


@pytest.mark.parametrize(
    "first,last",
    [
        (date(2026, 2, 1), date(2026, 2, 28)),  # 20 working days — fewer than the 21.7 average
        (date(2026, 7, 1), date(2026, 7, 31)),  # 23 working days — more
    ],
)
def test_a_month_of_unpaid_leave_is_worth_nothing_whatever_the_month(first, last):
    # art. 152.1 is a ratio, not a subtraction, and this is why. Subtracting the
    # real hours of a short month from a smoothed base left 13.33h on February's
    # declaration for a nanny who worked none of it. Asserting ">= 0" — as this
    # test first did — passes on that, and on a deduction that does nothing at all.
    leave = d.LeaveSpan("unpaid", first, last, "full_day")
    data = d.ContractMonth(
        month=first,
        starting_date=date(2026, 1, 5),
        ending_date=None,
        split_method="equal",
        family_ids=(FAMILY_A,),
        children=(),
        schedules=(schedule(*[block(i, time(9, 0), time(17, 0)) for i in range(5)]),),
        terms=(terms(),),
        leaves=(leave,),
    )
    result = d.compute_month(data)[FAMILY_A]
    assert result.normal_hours == Decimal("0")
    assert result.total_amount == Decimal("0")


def test_sickness_deducts_the_hours_like_an_unpaid_absence():
    # A sick day is not worked and the employer does not pay it, so the hours drop
    # exactly as an unpaid day off would — and the base is untouched by paid leave.
    blocks = [block(day, time(9, 0), time(17, 0)) for day in range(5)]
    sick = d.LeaveSpan("sickness", date(2026, 7, 13), date(2026, 7, 13), "full_day")
    unpaid = d.LeaveSpan("unpaid", date(2026, 7, 13), date(2026, 7, 13), "full_day")
    with_sick = d.compute_month(month(schedules=(schedule(*blocks),), leaves=(sick,)))[FAMILY_A]
    with_unpaid = d.compute_month(month(schedules=(schedule(*blocks),), leaves=(unpaid,)))[FAMILY_A]
    without = d.compute_month(month(schedules=(schedule(*blocks),)))[FAMILY_A]
    assert with_sick.normal_hours == with_unpaid.normal_hours
    assert with_sick.normal_hours < without.normal_hours


def test_a_sick_day_shares_its_reduction_across_the_families():
    # The nanny is off, so every family that would have had her that day loses its
    # share of it. A shared Monday deducts from both, by the presence each had.
    a, b = child(FAMILY_A), child(FAMILY_B)
    sick = d.LeaveSpan("sickness", date(2026, 7, 13), date(2026, 7, 13), "full_day")  # a Monday
    plain = d.compute_month(month(children=(a, b), families=(FAMILY_A, FAMILY_B)))
    sickened = d.compute_month(
        month(children=(a, b), families=(FAMILY_A, FAMILY_B), leaves=(sick,))
    )
    for family in (FAMILY_A, FAMILY_B):
        base = plain[family].normal_hours + plain[family].hours_25 + plain[family].hours_50
        after = (
            sickened[family].normal_hours + sickened[family].hours_25 + sickened[family].hours_50
        )
        assert after < base


def test_a_deducting_absence_is_flagged_but_paid_leave_is_not():
    # The lower figure must not read as a bug, so the declaration says why. Paid
    # leave changes nothing and raises nothing.
    sick = d.LeaveSpan("sickness", date(2026, 7, 13), date(2026, 7, 13), "full_day")
    unpaid = d.LeaveSpan("unpaid", date(2026, 7, 13), date(2026, 7, 13), "full_day")
    paid = d.LeaveSpan("paid", date(2026, 7, 13), date(2026, 7, 13), "full_day")
    assert "hours_reduced_for_absence" in d.compute_month(month(leaves=(sick,)))[FAMILY_A].warnings
    assert (
        "hours_reduced_for_absence" in d.compute_month(month(leaves=(unpaid,)))[FAMILY_A].warnings
    )
    assert (
        "hours_reduced_for_absence" not in d.compute_month(month(leaves=(paid,)))[FAMILY_A].warnings
    )
    assert "hours_reduced_for_absence" not in d.compute_month(month())[FAMILY_A].warnings


def test_exceptional_hours_add_to_the_month():
    entry = d.ExceptionalEntry(
        FAMILY_A, "effective", date(2026, 7, 14), time(19, 0), date(2026, 7, 14), time(21, 0)
    )
    without = d.compute_month(month())[FAMILY_A]
    with_extra = d.compute_month(month(exceptional=(entry,)))[FAMILY_A]
    total_before = without.normal_hours + without.hours_25 + without.hours_50
    total_after = with_extra.normal_hours + with_extra.hours_25 + with_extra.hours_50
    assert total_after - total_before == Decimal("2.00")


def test_a_night_is_an_indemnity_not_hours():
    entry = d.ExceptionalEntry(
        FAMILY_A, "night_presence", date(2026, 7, 14), time(21, 0), date(2026, 7, 15), time(1, 0)
    )
    plain = d.compute_month(month())[FAMILY_A]
    result = d.compute_month(
        month(terms_=(terms(night_presence_rate="3.00"),), exceptional=(entry,))
    )[FAMILY_A]
    # The hours do not move; the indemnity does.
    assert result.normal_hours == plain.normal_hours
    assert result.night_indemnity == Decimal("12.00")  # 4h x 3.00
    assert result.night_count == 1


def test_a_night_rate_under_a_quarter_of_the_wage_is_lifted_to_the_floor():
    # art. 137.2: the indemnity "ne peut pas etre inferieur a un quart du salaire
    # contractuel verse pour une duree de travail effectif equivalente". A clause
    # below a conventional minimum is void and replaced by it, and the number this
    # produces is the one the parent types into pajemploi — so it pays the floor
    # (4h x 12.00/4 = 12.00) rather than the agreed 1.00/h, and says why.
    entry = d.ExceptionalEntry(
        FAMILY_A, "night_presence", date(2026, 7, 14), time(21, 0), date(2026, 7, 15), time(1, 0)
    )
    result = d.compute_month(
        month(terms_=(terms("12.00", night_presence_rate="1.00"),), exceptional=(entry,))
    )[FAMILY_A]
    assert "night_presence_rate_below_floor" in result.warnings
    assert result.night_indemnity == Decimal("12.00")


def test_an_unset_night_rate_still_pays_the_floor():
    entry = d.ExceptionalEntry(
        FAMILY_A, "night_presence", date(2026, 7, 14), time(21, 0), date(2026, 7, 15), time(1, 0)
    )
    result = d.compute_month(month(terms_=(terms("12.00"),), exceptional=(entry,)))[FAMILY_A]
    assert result.night_indemnity == Decimal("12.00")


def test_a_night_agreed_above_the_floor_is_paid_as_agreed():
    entry = d.ExceptionalEntry(
        FAMILY_A, "night_presence", date(2026, 7, 14), time(21, 0), date(2026, 7, 15), time(1, 0)
    )
    result = d.compute_month(
        month(terms_=(terms("12.00", night_presence_rate="5.00"),), exceptional=(entry,))
    )[FAMILY_A]
    assert result.night_indemnity == Decimal("20.00")  # 4h x 5.00
    assert "night_presence_rate_below_floor" not in result.warnings


def test_a_longer_night_costs_more_because_the_indemnity_is_hourly():
    # art. 137.2 prices every tier as a fraction "du salaire contractuel verse
    # pour une duree de travail effectif EQUIVALENTE" — so it scales with the
    # hours. "Forfaitaire" means "not working time", not "flat per night".
    short = d.ExceptionalEntry(
        FAMILY_A, "night_presence", date(2026, 7, 14), time(22, 0), date(2026, 7, 15), time(0, 0)
    )
    long = d.ExceptionalEntry(
        FAMILY_A, "night_presence", date(2026, 7, 14), time(22, 0), date(2026, 7, 15), time(4, 0)
    )
    rate = (terms("12.00", night_presence_rate="3.00"),)
    two = d.compute_month(month(terms_=rate, exceptional=(short,)))[FAMILY_A]
    six = d.compute_month(month(terms_=rate, exceptional=(long,)))[FAMILY_A]
    assert two.night_indemnity == Decimal("6.00")
    assert six.night_indemnity == Decimal("18.00")


def test_a_night_woken_twice_is_owed_a_third_not_a_quarter():
    # "est portee a un tiers" — an obligation, not a floor to warn about.
    quiet = d.ExceptionalEntry(
        FAMILY_A, "night_presence", date(2026, 7, 14), time(21, 0), date(2026, 7, 15), time(1, 0)
    )
    disturbed = d.ExceptionalEntry(
        FAMILY_A,
        "night_presence",
        date(2026, 7, 14),
        time(21, 0),
        date(2026, 7, 15),
        time(1, 0),
        interventions=2,
    )
    rate = (terms("12.00"),)
    assert d.compute_month(month(terms_=rate, exceptional=(quiet,)))[
        FAMILY_A
    ].night_indemnity == Decimal("12.00")  # 4h x 12/4
    assert d.compute_month(month(terms_=rate, exceptional=(disturbed,)))[
        FAMILY_A
    ].night_indemnity == Decimal("16.00")  # 4h x 12/3


def test_four_interventions_every_night_asks_for_the_contract_to_be_revised():
    entry = d.ExceptionalEntry(
        FAMILY_A,
        "night_presence",
        date(2026, 7, 14),
        time(21, 0),
        date(2026, 7, 15),
        time(1, 0),
        interventions=4,
    )
    result = d.compute_month(month(terms_=(terms("12.00"),), exceptional=(entry,)))[FAMILY_A]
    assert "night_presence_should_be_requalified" in result.warnings
    assert "night_interventions_need_manual_pricing" in result.warnings


def test_advantages_are_split_so_the_nanny_gets_what_was_agreed_once():
    a, b = child(FAMILY_A), child(FAMILY_B)
    results = d.compute_month(
        month(
            children=(a, b),
            families=(FAMILY_A, FAMILY_B),
            terms_=(terms(transport_fee="40.00", benefits_in_kind="30.00"),),
        )
    )
    assert sum(r.transport_amount for r in results.values()) == Decimal("40.00")
    assert sum(r.benefits_in_kind_amount for r in results.values()) == Decimal("30.00")


def test_mileage_uses_the_kilometres_entered_on_the_declaration():
    result = d.compute_month(
        month(terms_=(terms(mileage_rate="0.350"),), kilometers={FAMILY_A: Decimal("120")})
    )[FAMILY_A]
    assert result.mileage_amount == Decimal("42.00")


def test_a_mid_month_raise_is_flagged_and_its_periods_kept():
    result = d.compute_month(
        month(terms_=(terms("12.00"), terms("13.00", effective_from=date(2026, 7, 16))))
    )[FAMILY_A]
    assert "rates_changed_mid_month" in result.warnings
    assert len(result.rate_periods) == 2
    # The flat rate is the one in force on the last day: what the UI shows.
    assert result.net_hourly_rate == Decimal("13.00")


def test_a_mid_month_raise_keeps_the_hours_and_prices_the_declared_ones():
    # salaire net has to equal what pajemploi recomputes from the hours the parent
    # types, so it is priced from the declared (whole) hours at the last day's
    # rate — the one number the parent sees. The mid-month detail lives in
    # rate_periods and the rates_changed_mid_month warning, not in the headline.
    flat = d.compute_month(month())[FAMILY_A]
    raised = d.compute_month(
        month(terms_=(terms("12.00"), terms("13.00", effective_from=date(2026, 7, 16))))
    )[FAMILY_A]
    assert raised.normal_hours == flat.normal_hours
    assert "rates_changed_mid_month" in raised.warnings
    at_new = d.compute_month(month(terms_=(terms("13.00"),)))[FAMILY_A]
    # Priced at the last day's 13.00 for the whole month: the same as a flat
    # 13.00 month on the same hours.
    assert raised.net_salary == at_new.net_salary
    assert raised.total_amount == at_new.total_amount


def test_a_month_with_no_schedule_yields_zeroes_rather_than_an_error():
    result = d.compute_month(month(schedules=()))[FAMILY_A]
    assert result.normal_hours == Decimal("0")
    assert result.total_amount == Decimal("0")


@pytest.mark.parametrize(
    "end_hour,split,kids",
    [
        (17, "equal", 1),
        (18, "by_children", 2),
        (19, "by_children", 3),
        (17, "by_children", 1),
        (20, "equal", 2),
    ],
)
def test_the_families_together_never_declare_less_than_the_nanny_worked(end_hour, split, kids):
    # The ceiling errs the nanny's way: each family rounds its own bands UP, so
    # the parts sum to at least what she worked, never less. (The old exact-sum
    # invariant is deliberately gone — that is what a ceiling costs.)
    a_kids = [child(FAMILY_A) for _ in range(kids)]
    b1 = child(FAMILY_B)
    blocks = [block(day, time(8, 0), time(end_hour, 0)) for day in range(5)]
    results = d.compute_month(
        month(
            children=(*a_kids, b1),
            schedules=(schedule(*blocks),),
            split=split,
            families=(FAMILY_A, FAMILY_B),
        )
    )
    declared = sum(r.normal_hours + r.hours_25 + r.hours_50 for r in results.values())
    weekly = (end_hour - 8) * 5 * 60
    worked = d.to_hours(d.mensualise(d.Bands(Fraction(weekly))).normal)
    assert declared >= worked
    # ...and by no more than one whole hour per family per band it rounded up.
    assert declared - worked < len(results) * 3


# --- the sum invariant under adversarial input -------------------------------


def test_a_filer_with_no_share_in_the_contract_is_ignored():
    # A row from a family not on the contract attributes to nobody, rather than
    # its minutes leaking into the split.
    stray = UUID("cccccccc-0000-0000-0000-000000000003")
    entries = [
        d.ExceptionalEntry(
            FAMILY_A, "effective", date(2026, 7, 14), time(20, 0), date(2026, 7, 14), time(22, 0)
        ),
        d.ExceptionalEntry(
            stray, "effective", date(2026, 7, 14), time(20, 0), date(2026, 7, 14), time(22, 0)
        ),
    ]
    minutes = d.attribute_exceptional(entries, EQUAL_SHARES, [FAMILY_A, FAMILY_B])
    assert minutes == {FAMILY_A: Fraction(2 * 60)}


def test_a_child_of_a_family_not_on_the_contract_is_ignored_not_paid_to_nobody():
    # All-zero weights would attribute the segment to no one and lose the hours.
    stray_family = UUID("cccccccc-0000-0000-0000-000000000003")
    a = child(FAMILY_A)
    outsider = child(stray_family)
    children = by_id(a, outsider)
    weights = d.segment_weights(
        frozenset({a.child_id, outsider.child_id}), children, "by_children", [FAMILY_A, FAMILY_B]
    )
    assert sum(weights.values()) == 1
    assert weights[FAMILY_A] == 1


def test_only_outsider_children_present_falls_back_rather_than_vanishing():
    stray_family = UUID("cccccccc-0000-0000-0000-000000000003")
    outsider = child(stray_family)
    weights = d.segment_weights(
        frozenset({outsider.child_id}), by_id(outsider), "by_children", [FAMILY_A, FAMILY_B]
    )
    assert sum(weights.values()) == 1


# --- exceptional hours: determinism and stacking -----------------------------


def test_the_declaration_does_not_depend_on_the_order_rows_arrive_in():
    e1 = d.ExceptionalEntry(
        FAMILY_A, "effective", date(2026, 7, 14), time(19, 0), date(2026, 7, 14), time(21, 0)
    )
    e2 = d.ExceptionalEntry(
        FAMILY_A, "effective", date(2026, 7, 16), time(19, 0), date(2026, 7, 16), time(21, 0)
    )
    forwards = d.compute_month(month(exceptional=(e1, e2)))[FAMILY_A]
    backwards = d.compute_month(month(exceptional=(e2, e1)))[FAMILY_A]
    assert forwards.normal_hours == backwards.normal_hours
    assert forwards.hours_25 == backwards.hours_25
    assert forwards.hours_50 == backwards.hours_50


def test_an_entry_outside_the_month_is_not_paid():
    away = d.ExceptionalEntry(
        FAMILY_A, "effective", date(2026, 12, 24), time(19, 0), date(2026, 12, 24), time(23, 0)
    )
    plain = d.compute_month(month())[FAMILY_A]
    result = d.compute_month(month(exceptional=(away,)))[FAMILY_A]
    assert result.total_amount == plain.total_amount


def test_an_entry_after_the_contract_ends_is_not_paid():
    # The base is clipped to the contract by sub_periods; the exceptional path
    # used to ignore the span entirely and pay a December evening in July.
    def ended_contract(exceptional):
        return d.ContractMonth(
            month=date(2026, 7, 1),
            starting_date=date(2026, 1, 5),
            ending_date=date(2026, 7, 10),
            split_method="equal",
            family_ids=(FAMILY_A,),
            children=(),
            schedules=(schedule(*[block(i) for i in range(5)]),),
            terms=(terms(),),
            exceptional=exceptional,
        )

    entry = d.ExceptionalEntry(
        FAMILY_A, "effective", date(2026, 7, 20), time(19, 0), date(2026, 7, 20), time(23, 0)
    )
    plain = d.compute_month(ended_contract(()))[FAMILY_A]
    result = d.compute_month(ended_contract((entry,)))[FAMILY_A]
    assert result.total_amount == plain.total_amount


def test_presence_responsable_on_a_shared_contract_is_paid_in_full_and_flagged():
    # art. 137.1 excludes it from a garde partagee. A row predating the rule must
    # not quietly pay two thirds of what is owed.
    a, b = child(FAMILY_A), child(FAMILY_B)
    entry = d.ExceptionalEntry(
        FAMILY_A,
        "presence_responsable",
        date(2026, 7, 14),
        time(19, 0),
        date(2026, 7, 14),
        time(22, 0),
    )
    results = d.compute_month(
        month(children=(a, b), families=(FAMILY_A, FAMILY_B), exceptional=(entry,))
    )
    assert "presence_responsable_in_shared_care" in results[FAMILY_A].warnings
    plain = d.compute_month(month(children=(a, b), families=(FAMILY_A, FAMILY_B)))
    added = sum(
        results[f].normal_hours + results[f].hours_25 + results[f].hours_50
        for f in (FAMILY_A, FAMILY_B)
    ) - sum(
        plain[f].normal_hours + plain[f].hours_25 + plain[f].hours_50 for f in (FAMILY_A, FAMILY_B)
    )
    assert added == Decimal("3.00")  # the full 3h, not 2h


def test_apportion_keeps_its_invariant_on_a_negative_total():
    # int() truncates toward zero; floor() is what keeps the parts summing.
    parts = d.apportion(Decimal("-10"), [Fraction(1, 3)] * 3)
    assert sum(parts) == Decimal("-10")


# --- exceptional presence: a transfer, not an addition -----------------------


def shared_month(**kw):
    a1 = child(FAMILY_A, child_id=UUID("11111111-0000-0000-0000-000000000001"))
    a2 = child(
        FAMILY_A,
        *[(day, time(16, 30), time(18, 0)) for day in range(5)],
        child_id=UUID("11111111-0000-0000-0000-000000000002"),
    )
    b1 = child(FAMILY_B, child_id=UUID("22222222-0000-0000-0000-000000000001"))
    return by_id(a1, a2, b1), month(
        children=(a1, a2, b1), split="by_children", families=(FAMILY_A, FAMILY_B), **kw
    )


def test_an_exceptional_presence_moves_the_split_without_moving_the_hours():
    # Tom is normally there from 16:30; today he was there from 08:00. The nanny
    # works exactly the same day — she is already there for the others — so the
    # month's total cannot move. Only who owes it.
    children, plain_data = shared_month()
    tom = UUID("11111111-0000-0000-0000-000000000002")
    override = d.PresenceOverride(tom, date(2026, 7, 13), time(8, 0), time(16, 30))
    _, with_data = shared_month(overrides=(override,))

    plain = d.compute_month(plain_data)
    shifted = d.compute_month(with_data)

    def declared(results):
        return sum(r.normal_hours + r.hours_25 + r.hours_50 for r in results.values())

    assert declared(shifted) == declared(plain)
    # Dupont had two children present all that Monday instead of one, so they
    # carry more of it and Martin less.
    assert shifted[FAMILY_A].normal_hours > plain[FAMILY_A].normal_hours
    assert shifted[FAMILY_B].normal_hours < plain[FAMILY_B].normal_hours


def test_an_override_applies_to_its_date_and_not_every_matching_weekday():
    # Matching the child but not the day reads identically and silently repeats a
    # one-off on every Monday of the month.
    _, one_monday = shared_month(
        overrides=(
            d.PresenceOverride(
                UUID("11111111-0000-0000-0000-000000000002"),
                date(2026, 7, 13),
                time(8, 0),
                time(16, 30),
            ),
        )
    )
    _, two_mondays = shared_month(
        overrides=(
            d.PresenceOverride(
                UUID("11111111-0000-0000-0000-000000000002"),
                date(2026, 7, 13),
                time(8, 0),
                time(16, 30),
            ),
            d.PresenceOverride(
                UUID("11111111-0000-0000-0000-000000000002"),
                date(2026, 7, 20),
                time(8, 0),
                time(16, 30),
            ),
        )
    )
    one = d.compute_month(one_monday)[FAMILY_A].normal_hours
    two = d.compute_month(two_mondays)[FAMILY_A].normal_hours
    # Two exceptional Mondays must cost Martin more than one. If the date were
    # ignored, one override would already have applied to all five and these
    # would be equal.
    assert two > one


def test_an_override_outside_the_month_changes_nothing():
    _, plain_data = shared_month()
    _, away_data = shared_month(
        overrides=(
            d.PresenceOverride(
                UUID("11111111-0000-0000-0000-000000000002"),
                date(2026, 12, 14),
                time(8, 0),
                time(16, 30),
            ),
        )
    )
    assert (
        d.compute_month(away_data)[FAMILY_A].normal_hours
        == d.compute_month(plain_data)[FAMILY_A].normal_hours
    )


# --- jours fériés ------------------------------------------------------------


def bastille_day(**kw):
    # 14 July 2026 is a Tuesday, so the schedule places 10h on it.
    return d.Holiday(day=date(2026, 7, 14), **kw)


def test_a_chomé_holiday_owes_nothing_because_the_base_already_pays_it():
    # Mensualisation is a fixed x 52 / 12 precisely so a month's shape does not
    # matter. May has more feries than March; the base is identical.
    plain = d.compute_month(month())[FAMILY_A]
    holiday = d.compute_month(month(holidays=(bastille_day(),)))[FAMILY_A]
    assert holiday.total_amount == plain.total_amount
    assert holiday.holiday_majoration == Decimal("0")


def test_a_worked_holiday_owes_ten_percent_on_the_hours_done():
    # art. 47.2. The schedule puts 10h on that Tuesday, at 12.00 -> 12.00 extra.
    result = d.compute_month(month(holidays=(bastille_day(is_workable=True),)))[FAMILY_A]
    assert result.holiday_majoration == Decimal("12.00")


def test_a_worked_first_of_may_owes_a_hundred_percent():
    # art. 47.1. 1 May 2026 is a Friday: 10h x 12.00 x 100% = 120.00.
    may = d.ContractMonth(
        month=date(2026, 5, 1),
        starting_date=date(2026, 1, 5),
        ending_date=None,
        split_method="equal",
        family_ids=(FAMILY_A,),
        children=(),
        schedules=(schedule(*[block(i) for i in range(5)]),),
        terms=(terms(),),
        holidays=(d.Holiday(day=date(2026, 5, 1), is_workable=True),),
    )
    assert d.compute_month(may)[FAMILY_A].holiday_majoration == Decimal("120.00")


def test_the_journee_de_solidarite_is_worked_and_owes_nothing():
    # Those hours are owed, not bought. It is is_workable like any other worked
    # holiday, so without the flag it would collect art. 47.2's 10%.
    result = d.compute_month(month(holidays=(bastille_day(is_workable=True, is_solidarity=True),)))[
        FAMILY_A
    ]
    assert result.holiday_majoration == Decimal("0")


def test_a_holiday_on_a_day_she_never_works_owes_nothing():
    # 15 August 2026 is a Saturday.
    result = d.compute_month(month(holidays=(d.Holiday(day=date(2026, 8, 15), is_workable=True),)))[
        FAMILY_A
    ]
    assert result.holiday_majoration == Decimal("0")


def test_a_worked_holiday_is_shared_like_the_day_it_falls_on():
    a, b = child(FAMILY_A), child(FAMILY_B)
    results = d.compute_month(
        month(
            children=(a, b),
            families=(FAMILY_A, FAMILY_B),
            holidays=(bastille_day(is_workable=True),),
        )
    )
    # One nanny, one worked holiday: the majoration divides, it does not double.
    assert sum(r.holiday_majoration for r in results.values()) == Decimal("12.00")
    assert results[FAMILY_A].holiday_majoration == results[FAMILY_B].holiday_majoration


def test_the_majoration_reaches_the_total():
    plain = d.compute_month(month())[FAMILY_A]
    worked = d.compute_month(month(holidays=(bastille_day(is_workable=True),)))[FAMILY_A]
    assert worked.total_amount - plain.total_amount == Decimal("12.00")


# --- solo vs shared exceptional hours, through compute_month -------------------
#
# These go through compute_month deliberately. The attribution rule is unit-tested
# on attribute_exceptional above; here it is the integration that matters — that a
# solo entry stays wholly its filer's, a shared one splits, and each family's
# number never depends on whether the other filed. The base is a 50h week, so an
# evening lands in the 50% band; adding a whole number of hours to a band survives
# the ceiling exactly, which is why these deltas stay clean.


def two_family_month(**kw):
    a, b = child(FAMILY_A), child(FAMILY_B)
    return month(children=(a, b), families=(FAMILY_A, FAMILY_B), **kw)


def declared(results):
    return sum(r.normal_hours + r.hours_25 + r.hours_50 for r in results.values())


def evening(family, start, end, kind="effective", day=14, shared=False):
    return d.ExceptionalEntry(
        family,
        kind,
        date(2026, 7, day),
        time(start, 0),
        date(2026, 7, day),
        time(end, 0),
        is_shared=shared,
    )


def gained_by(plain, results, family):
    return (results[family].normal_hours + results[family].hours_25 + results[family].hours_50) - (
        plain[family].normal_hours + plain[family].hours_25 + plain[family].hours_50
    )


def test_both_families_filing_a_matching_shared_evening_pay_for_it_once():
    both = (evening(FAMILY_A, 18, 20, shared=True), evening(FAMILY_B, 18, 20, shared=True))
    plain = d.compute_month(two_family_month())
    shared = d.compute_month(two_family_month(exceptional=both))
    # Each declares its own half of the 2h, so together the nanny is paid it once.
    assert gained_by(plain, shared, FAMILY_A) == Decimal("1.00")
    assert gained_by(plain, shared, FAMILY_B) == Decimal("1.00")
    assert declared(shared) - declared(plain) == Decimal("2.00")
    assert "overlapping_solo_exceptional" not in shared[FAMILY_A].warnings


def test_two_families_filing_solo_for_the_same_evening_each_pay_full_and_are_warned():
    # The new independence: a solo entry is wholly its filer's, so two families
    # each booking 18:00-20:00 as their own each pay the full 2h. That is almost
    # always shared care that was not marked shared, so it is flagged.
    both = (evening(FAMILY_A, 18, 20), evening(FAMILY_B, 18, 20))
    plain = d.compute_month(two_family_month())
    result = d.compute_month(two_family_month(exceptional=both))
    assert gained_by(plain, result, FAMILY_A) == Decimal("2.00")
    assert gained_by(plain, result, FAMILY_B) == Decimal("2.00")
    assert "overlapping_solo_exceptional" in result[FAMILY_A].warnings


def test_shared_care_plus_a_solo_extension_attributes_each_part_on_its_own():
    # 18:00-20:00 both needed her (each files it shared); 20:00-21:00 only A did
    # (A files it solo). A gets its half of the shared 2h plus the whole solo 1h;
    # B gets only its half of the shared 2h. Neither reads the other's rows.
    entries = (
        evening(FAMILY_A, 18, 20, shared=True),
        evening(FAMILY_B, 18, 20, shared=True),
        evening(FAMILY_A, 20, 21),
    )
    plain = d.compute_month(two_family_month())
    shared = d.compute_month(two_family_month(exceptional=entries))
    assert gained_by(plain, shared, FAMILY_A) == Decimal("2.00")
    assert gained_by(plain, shared, FAMILY_B) == Decimal("1.00")
    assert declared(shared) - declared(plain) == Decimal("3.00")


def test_one_family_filing_alone_still_carries_all_of_it():
    plain = d.compute_month(two_family_month())
    solo = d.compute_month(two_family_month(exceptional=(evening(FAMILY_A, 18, 20),)))

    def gained(family, results):
        return (
            results[family].normal_hours + results[family].hours_25 + results[family].hours_50
        ) - (plain[family].normal_hours + plain[family].hours_25 + plain[family].hours_50)

    assert gained(FAMILY_A, solo) == Decimal("2.00")
    assert gained(FAMILY_B, solo) == Decimal("0")


def test_a_family_filing_the_same_evening_twice_is_not_paid_for_both():
    # The union runs inside reconcile_exceptional; this checks it survives the trip
    # through compute_month too.
    sloppy = (evening(FAMILY_A, 18, 20), evening(FAMILY_A, 19, 21))
    plain = d.compute_month(two_family_month())
    result = d.compute_month(two_family_month(exceptional=sloppy))
    assert declared(result) - declared(plain) == Decimal("3.00")  # 18:00-21:00, not 4h


def test_nights_and_evenings_do_not_reconcile_with_each_other():
    # Different work: an evening for A and a night for B on the same date must not
    # be treated as one shared span.
    entries = (
        evening(FAMILY_A, 18, 20),
        d.ExceptionalEntry(
            FAMILY_B,
            "night_presence",
            date(2026, 7, 14),
            time(21, 0),
            date(2026, 7, 15),
            time(1, 0),
        ),
    )
    plain = d.compute_month(two_family_month(terms_=(terms("12.00"),)))
    result = d.compute_month(two_family_month(terms_=(terms("12.00"),), exceptional=entries))
    # Only the evening is hours; the night is an indemnity and stays out of them.
    assert declared(result) - declared(plain) == Decimal("2.00")
    assert result[FAMILY_B].night_indemnity == Decimal("12.00")
    assert result[FAMILY_A].night_indemnity == Decimal("0")


# --- a presence override lands in the band its day really sits in --------------


def test_a_correction_on_a_late_week_day_reaches_the_overtime_band():
    # A 45h week is 40h normal + 5h at 25%, so Friday straddles the line. Banding
    # the day on its own would walk it from zero and call the whole correction
    # normal, leaving the 25% counts wrong on both declarations.
    a1 = child(FAMILY_A, child_id=UUID("11111111-0000-0000-0000-000000000001"))
    a2 = child(
        FAMILY_A,
        *[(day, time(16, 0), time(17, 0)) for day in range(5)],
        child_id=UUID("11111111-0000-0000-0000-000000000002"),
    )
    b1 = child(FAMILY_B, child_id=UUID("22222222-0000-0000-0000-000000000001"))
    children = by_id(a1, a2, b1)
    blocks = [block(day, time(8, 0), time(17, 0)) for day in range(5)]  # 45h
    friday = d.PresenceOverride(a2.child_id, date(2026, 7, 17), time(8, 0), time(16, 0))
    data = month(
        children=(a1, a2, b1),
        schedules=(schedule(*blocks),),
        split="by_children",
        families=(FAMILY_A, FAMILY_B),
        overrides=(friday,),
    )
    corrections = d.presence_corrections(data, children)
    assert corrections[FAMILY_A].at_25 != 0, "a Friday correction never touched the 25% band"
    # Still a transfer: the nanny's day is no longer for it.
    assert (corrections[FAMILY_A] + corrections[FAMILY_B]).total == 0
    assert corrections[FAMILY_A].at_25 == -corrections[FAMILY_B].at_25


def test_every_emitted_warning_has_a_source_and_no_source_is_dead():
    """The warnings compute_month raises and the citations it can resolve must be
    the same set: a warning without a source shows a bare code to a parent about
    to file, and a source no warning emits is a citation for a rule we never
    flag. Both drift silently, so pin them together."""
    import re
    from pathlib import Path

    from tracking.sources import WARNING_SOURCES

    module_source = Path(d.__file__).read_text()
    emitted = set(re.findall(r'warnings\.append\(\s*"([a-z0-9_]+)"', module_source))
    assert emitted, "the regex found no warnings — has the append shape changed?"
    assert emitted == set(WARNING_SOURCES)
