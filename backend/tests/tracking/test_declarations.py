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


def schedule(*blocks, weeks_per_year=52, effective_from=date(2026, 1, 1)):
    return d.Schedule(
        effective_from=effective_from, weeks_per_year=weeks_per_year, blocks=tuple(blocks)
    )


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
    bands = d.Bands(normal=Fraction(40 * 60))
    assert d.to_hours(d.mensualise(bands, 52).normal) == Decimal("173.33")


def test_an_incomplete_year_mensualises_on_its_own_week_count():
    bands = d.Bands(normal=Fraction(40 * 60))
    assert d.to_hours(d.mensualise(bands, 47).normal) == Decimal("156.67")


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


def test_a_family_filing_overlapping_entries_is_not_paid_for_both():
    entries = [
        d.ExceptionalEntry(
            FAMILY_A, "effective", date(2026, 7, 14), time(19, 0), date(2026, 7, 14), time(21, 0)
        ),
        d.ExceptionalEntry(
            FAMILY_A, "effective", date(2026, 7, 14), time(20, 0), date(2026, 7, 14), time(22, 0)
        ),
    ]
    minutes = d.reconcile_exceptional(entries, {}, "equal", [FAMILY_A, FAMILY_B])
    assert minutes[FAMILY_A] == 3 * 60  # 19:00-22:00, not 4h


def test_two_families_overlapping_share_the_overlap_and_keep_the_rest():
    entries = [
        d.ExceptionalEntry(
            FAMILY_A, "effective", date(2026, 7, 14), time(20, 0), date(2026, 7, 14), time(23, 0)
        ),
        d.ExceptionalEntry(
            FAMILY_B, "effective", date(2026, 7, 14), time(20, 0), date(2026, 7, 14), time(22, 0)
        ),
    ]
    minutes = d.reconcile_exceptional(entries, {}, "equal", [FAMILY_A, FAMILY_B])
    # 20:00-22:00 shared (1h each), 22:00-23:00 all A.
    assert minutes[FAMILY_A] == 2 * 60
    assert minutes[FAMILY_B] == 60
    # The nanny worked 3h and is paid for 3h.
    assert sum(minutes.values()) == 3 * 60


def test_exceptional_hours_ignore_the_childrens_windows():
    # A's child is windowed to the afternoon, so the windows would call them
    # absent at 19:00 and bill A's own late night to B.
    a = child(FAMILY_A, (TUESDAY, time(16, 30), time(18, 0)))
    b = child(FAMILY_B)
    entry = d.ExceptionalEntry(
        FAMILY_A, "effective", date(2026, 7, 14), time(19, 0), date(2026, 7, 14), time(21, 0)
    )
    minutes = d.reconcile_exceptional([entry], by_id(a, b), "equal", [FAMILY_A, FAMILY_B])
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
    minutes = d.reconcile_exceptional(entries, {}, "equal", [FAMILY_A])
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
    # 8h x 5 days = 40h; 40 x 52 / 12 = 173.33h, all normal, at 12 EUR.
    blocks = [block(day, time(9, 0), time(17, 0)) for day in range(5)]
    result = d.compute_month(month(schedules=(schedule(*blocks),)))[FAMILY_A]
    assert result.normal_hours == Decimal("173.33")
    assert result.hours_25 == Decimal("0")
    assert result.total_amount == Decimal("2079.96")


def test_a_shared_month_never_declares_more_hours_than_the_nanny_worked():
    a1 = child(FAMILY_A)
    a2 = child(FAMILY_A, *[(day, time(16, 30), time(18, 0)) for day in range(5)])
    b1 = child(FAMILY_B)
    results = d.compute_month(
        month(children=(a1, a2, b1), split="by_children", families=(FAMILY_A, FAMILY_B))
    )
    declared = sum(r.normal_hours + r.hours_25 + r.hours_50 for r in results.values())
    # 10h x 5 = 50h/week -> 40 normal + 8 at 25% + 2 at 50%, mensualised.
    worked = d.to_hours(d.mensualise(d.Bands(Fraction(50 * 60)), 52).normal)
    assert declared == worked
    # A carries more than B, because A's second child is there after school.
    assert results[FAMILY_A].normal_hours > results[FAMILY_B].normal_hours


def test_the_overtime_bands_survive_the_split():
    a, b = child(FAMILY_A), child(FAMILY_B)
    blocks = [block(day, time(8, 0), time(17, 0)) for day in range(5)]  # 45h
    results = d.compute_month(
        month(children=(a, b), schedules=(schedule(*blocks),), families=(FAMILY_A, FAMILY_B))
    )
    # Splitting first would leave 22.5h each, all normal, and no majoration.
    assert results[FAMILY_A].hours_25 > 0
    assert results[FAMILY_B].hours_25 > 0


def test_unpaid_leave_deducts_the_hours_that_day_was_worth():
    blocks = [block(day, time(9, 0), time(17, 0)) for day in range(5)]
    leave = d.LeaveSpan("unpaid", date(2026, 7, 13), date(2026, 7, 13), "full_day")
    without = d.compute_month(month(schedules=(schedule(*blocks),)))[FAMILY_A]
    with_leave = d.compute_month(month(schedules=(schedule(*blocks),), leaves=(leave,)))[FAMILY_A]
    assert without.normal_hours - with_leave.normal_hours == Decimal("8.00")


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


def test_a_month_of_unpaid_leave_deducts_to_zero_and_no_further():
    leave = d.LeaveSpan("unpaid", date(2026, 7, 1), date(2026, 7, 31), "full_day")
    result = d.compute_month(month(leaves=(leave,)))[FAMILY_A]
    assert result.normal_hours >= 0
    assert result.total_amount >= 0


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


def test_a_night_rate_under_a_quarter_of_the_wage_warns_but_still_computes():
    entry = d.ExceptionalEntry(
        FAMILY_A, "night_presence", date(2026, 7, 14), time(21, 0), date(2026, 7, 15), time(1, 0)
    )
    result = d.compute_month(
        month(terms_=(terms("12.00", night_presence_rate="1.00"),), exceptional=(entry,))
    )[FAMILY_A]
    assert "night_presence_rate_below_floor" in result.warnings
    assert result.night_indemnity == Decimal("4.00")


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


def test_a_mid_month_raise_changes_the_price_but_not_the_hours():
    flat = d.compute_month(month())[FAMILY_A]
    raised = d.compute_month(
        month(terms_=(terms("12.00"), terms("13.00", effective_from=date(2026, 7, 16))))
    )[FAMILY_A]
    assert raised.normal_hours == flat.normal_hours


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
def test_the_families_together_always_declare_exactly_what_the_nanny_worked(end_hour, split, kids):
    # The invariant the whole feature rests on. It is not automatic: rounding each
    # family's bands on their own quietly loses a centihour whenever a band does
    # not divide cleanly, and that hour is one nobody pays for.
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
    assert declared == d.to_hours(d.mensualise(d.Bands(Fraction(weekly)), 52).normal)
