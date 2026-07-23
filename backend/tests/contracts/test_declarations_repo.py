"""The ORM boundary: loading a month, and writing the result back.

declarations.py has its own tests and no database. These cover the seam — the
filters that are wrong in a way that reads right, and the query count, which is
the whole reason this layer exists.
"""

from datetime import date, time, timedelta
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from children.models import Child
from contracts import declarations_repo
from contracts.declarations import first_of_month
from contracts.models import (
    ContractChild,
    ContractChildWindow,
    ContractSchedule,
    ContractShare,
    ContractTerms,
    ExceptionalHours,
    ExceptionalPresence,
    Leave,
    MonthlyDeclaration,
    ScheduleBlock,
)
from reference.models import BankHoliday

pytestmark = pytest.mark.django_db

JULY = date(2026, 7, 1)


@pytest.fixture
def wired(contract, family):
    """A contract with a week, a rate, and a child — enough to compute a month."""
    schedule = ContractSchedule.objects.create(contract=contract, effective_from=date(2026, 1, 5))
    for weekday in range(5):
        ScheduleBlock.objects.create(
            schedule=schedule, weekday=weekday, start_time=time(9, 0), end_time=time(17, 0)
        )
    ContractTerms.objects.create(
        contract=contract, effective_from=date(2026, 1, 5), net_hourly_rate=Decimal("12.00")
    )
    child = Child.objects.create(family=family, first_name="Léa")
    ContractChild.objects.create(contract=contract, child=child)
    return contract


def test_a_month_loads_into_the_pure_domain(wired, family):
    data = declarations_repo.load_contract_month(wired, JULY)
    assert data.month == JULY
    assert data.family_ids == (family.id,)
    assert len(data.schedules) == 1
    assert len(data.schedules[0].blocks) == 5
    assert len(data.terms) == 1
    assert len(data.children) == 1
    assert data.children[0].family_id == family.id


def test_the_schedule_in_force_at_the_months_start_is_loaded(wired):
    """`effective_from__gte=month_start` is the tempting filter and would drop the
    only snapshot the month has: it began in January."""
    data = declarations_repo.load_contract_month(wired, JULY)
    assert [s.effective_from for s in data.schedules] == [date(2026, 1, 5)]


def test_a_snapshot_starting_after_the_month_is_not_loaded(wired):
    ContractSchedule.objects.create(contract=wired, effective_from=date(2026, 9, 1))
    data = declarations_repo.load_contract_month(wired, JULY)
    assert all(s.effective_from <= date(2026, 7, 31) for s in data.schedules)


def test_a_leave_running_in_from_last_month_is_loaded(wired):
    """`start_date__month=7` would miss it; the filter has to be an overlap."""
    Leave.objects.create(
        contract=wired,
        leave_type=Leave.LeaveType.UNPAID,
        start_date=date(2026, 6, 28),
        end_date=date(2026, 7, 3),
    )
    data = declarations_repo.load_contract_month(wired, JULY)
    assert len(data.leaves) == 1


def test_a_leave_wholly_outside_the_month_is_not_loaded(wired):
    Leave.objects.create(
        contract=wired,
        leave_type=Leave.LeaveType.UNPAID,
        start_date=date(2026, 3, 1),
        end_date=date(2026, 3, 5),
    )
    assert declarations_repo.load_contract_month(wired, JULY).leaves == ()


def test_a_childs_windows_come_through_whole(wired):
    link = ContractChild.objects.get(contract=wired)
    for weekday in (0, 1, 3, 4):  # no Wednesday: that is what says "absent"
        ContractChildWindow.objects.create(
            contract_child=link, weekday=weekday, start_time=time(9, 0), end_time=time(17, 0)
        )
    data = declarations_repo.load_contract_month(wired, JULY)
    assert {w.weekday for w in data.children[0].windows} == {0, 1, 3, 4}


def test_every_familys_exceptional_hours_are_loaded_not_just_one(
    wired, family, other_family, owner
):
    """A's declared hours depend on whether B filed an overlapping entry, so both
    must be read even though neither may write the other's."""
    ContractShare.objects.create(contract=wired, family=other_family)
    for filer in (family, other_family):
        ExceptionalHours.objects.create(
            contract=wired,
            family=filer,
            start_date=date(2026, 7, 14),
            start_time=time(18, 0),
            end_date=date(2026, 7, 14),
            end_time=time(20, 0),
        )
    data = declarations_repo.load_contract_month(wired, JULY)
    assert len(data.exceptional) == 2
    assert len({e.family_id for e in data.exceptional}) == 2


def test_holidays_and_overrides_come_through(wired):
    BankHoliday.objects.create(name="Fête Nationale", date=date(2026, 7, 14), is_workable=True)
    child = ContractChild.objects.get(contract=wired).child
    ExceptionalPresence.objects.create(
        contract=wired,
        child=child,
        date=date(2026, 7, 13),
        start_time=time(9, 0),
        end_time=time(12, 0),
    )
    data = declarations_repo.load_contract_month(wired, JULY)
    assert [h.day for h in data.holidays] == [date(2026, 7, 14)]
    assert data.holidays[0].is_workable
    assert [o.day for o in data.overrides] == [date(2026, 7, 13)]


def test_loading_a_month_does_not_grow_with_the_data(wired, family, other_family):
    """The point of this layer, and the property that matters — not a magic count.

    The naive shape resolves the schedule in force per family per day: a query
    each, hundreds a month, growing with both. Here a second family, a second
    child and nineteen more entries must cost exactly what none of them did.
    """
    with CaptureQueriesContext(connection) as small:
        declarations_repo.load_contract_month(wired, JULY)

    ContractShare.objects.create(contract=wired, family=other_family)
    child = Child.objects.create(family=other_family, first_name="Hugo")
    link = ContractChild.objects.create(contract=wired, child=child)
    for weekday in range(5):
        ContractChildWindow.objects.create(
            contract_child=link, weekday=weekday, start_time=time(16, 30), end_time=time(18, 0)
        )
    for day in range(1, 20):
        ExceptionalHours.objects.create(
            contract=wired,
            family=other_family,
            start_date=date(2026, 7, day),
            start_time=time(18, 0),
            end_date=date(2026, 7, day),
            end_time=time(19, 0),
        )
        Leave.objects.create(
            contract=wired,
            leave_type=Leave.LeaveType.PAID,
            start_date=date(2026, 7, day),
            end_date=date(2026, 7, day),
        )

    with CaptureQueriesContext(connection) as large:
        declarations_repo.load_contract_month(wired, JULY)

    assert len(large) == len(small), (
        f"{len(small)} queries became {len(large)} — the loader is scaling with the data"
    )


def test_computing_the_month_touches_the_database_not_at_all(wired, django_assert_num_queries):
    from contracts import declarations

    data = declarations_repo.load_contract_month(wired, JULY)
    with django_assert_num_queries(0):
        declarations.compute_month(data)


def test_a_declaration_is_created_per_family(wired, other_family):
    ContractShare.objects.create(contract=wired, family=other_family)
    rows = declarations_repo.declarations_for(wired, JULY)
    assert len(rows) == 2
    assert {r.family_id for r in rows} == {s.family_id for s in wired.shares.all()}
    assert all(r.status == MonthlyDeclaration.Status.DRAFT for r in rows)
    assert all(r.month == JULY for r in rows)


def test_a_draft_follows_the_live_data(wired):
    first = declarations_repo.declarations_for(wired, JULY)[0]
    before = first.normal_hours

    # A raise mid-month: the draft must move with it.
    ContractTerms.objects.create(
        contract=wired, effective_from=date(2026, 7, 16), net_hourly_rate=Decimal("20.00")
    )
    again = declarations_repo.declarations_for(wired, JULY)[0]
    assert again.pk == first.pk, "recomputing must update the row, not add one"
    assert again.normal_hours == before, "a raise moves the price, never the hours"
    assert "rates_changed_mid_month" in again.warnings


def test_a_recent_filed_declaration_follows_live_data(wired, owner):
    """Within its grace window a filed month is still editable in place, so a
    correction to the terms flows into it exactly as it would into a draft."""
    row = declarations_repo.declarations_for(wired, JULY)[0]
    declarations_repo.file_declaration(row, owner)
    filed_total = row.total_amount

    ContractTerms.objects.create(
        contract=wired, effective_from=date(2026, 7, 2), net_hourly_rate=Decimal("99.00")
    )
    again = declarations_repo.declarations_for(wired, JULY)[0]
    assert again.status == MonthlyDeclaration.Status.FILED
    assert again.total_amount != filed_total  # the raise moved it


def test_a_locked_filed_declaration_never_moves_again(wired, owner):
    """Past the window a filed row is the record of what was sent — frozen, whatever
    happens to the terms, the schedule or the leaves afterwards."""
    old_month = first_of_month(timezone.localdate(), -(MonthlyDeclaration.EDIT_GRACE_MONTHS + 1))
    row = declarations_repo.declarations_for(wired, old_month)[0]
    declarations_repo.file_declaration(row, owner)
    assert row.is_frozen
    filed_total = row.total_amount

    # Change everything the number was built from.
    ContractTerms.objects.create(
        contract=wired,
        effective_from=old_month + timedelta(days=1),
        net_hourly_rate=Decimal("99.00"),
    )
    Leave.objects.create(
        contract=wired,
        leave_type=Leave.LeaveType.UNPAID,
        start_date=old_month,
        end_date=old_month + timedelta(days=27),
    )

    again = declarations_repo.declarations_for(wired, old_month)[0]
    assert again.status == MonthlyDeclaration.Status.FILED
    assert again.total_amount == filed_total
    assert again.filed_by == owner


def test_filing_is_idempotent(wired, owner):
    row = declarations_repo.declarations_for(wired, JULY)[0]
    declarations_repo.file_declaration(row, owner)
    filed_at = row.filed_at
    declarations_repo.file_declaration(row, owner)
    assert row.filed_at == filed_at


def test_kilometres_survive_a_recompute(wired):
    row = declarations_repo.declarations_for(wired, JULY)[0]
    row.kilometers = Decimal("120")
    row.save(update_fields=["kilometers"])

    ContractTerms.objects.create(
        contract=wired,
        effective_from=date(2026, 7, 16),
        net_hourly_rate=Decimal("12.00"),
        mileage_rate=Decimal("0.350"),
    )
    again = declarations_repo.declarations_for(wired, JULY)[0]
    assert again.kilometers == Decimal("120"), "a recompute must not wipe what was typed"
    assert again.mileage_amount == Decimal("42.00")


def test_a_month_the_contract_does_not_cover_declares_nothing(wired):
    wired.ending_date = date(2026, 5, 31)
    wired.save(update_fields=["ending_date"])
    rows = declarations_repo.declarations_for(wired, JULY)
    assert all(r.normal_hours == Decimal("0") for r in rows)
    assert all(r.total_amount == Decimal("0") for r in rows)


def test_the_declaration_snapshots_the_rate_it_was_priced_with(wired):
    row = declarations_repo.declarations_for(wired, JULY)[0]
    assert row.net_hourly_rate == Decimal("12.00")
    assert row.rate_periods and row.rate_periods[0]["net_hourly_rate"] == "12.00"


def test_a_month_with_no_terms_at_all_does_not_explode(contract):
    ContractSchedule.objects.create(contract=contract, effective_from=date(2026, 1, 5))
    rows = declarations_repo.declarations_for(contract, JULY)
    assert all(r.total_amount == Decimal("0") for r in rows)


def test_the_month_is_normalised_to_its_first(wired):
    rows = declarations_repo.declarations_for(wired, date(2026, 7, 23))
    assert all(r.month == JULY for r in rows)


def test_a_second_month_is_its_own_row(wired):
    declarations_repo.declarations_for(wired, JULY)
    declarations_repo.declarations_for(wired, date(2026, 8, 1))
    assert MonthlyDeclaration.objects.filter(contract=wired).count() == 2


def test_recomputing_unchanged_data_does_not_rewrite_the_row(wired):
    """The home dashboard reads several months across every contract, each read
    recomputing. When nothing has moved, the row must be left untouched — not
    re-saved with a fresh computed_at — so opening the dashboard does not rewrite
    months of unchanged drafts."""
    first = declarations_repo.declarations_for(wired, JULY)[0]
    stamp = first.computed_at

    again = declarations_repo.declarations_for(wired, JULY)[0]
    again.refresh_from_db()
    assert again.pk == first.pk
    assert again.computed_at == stamp, "an unchanged draft was rewritten on read"


def test_windows_grouped_by_weekday_keep_every_window(wired):
    link = ContractChild.objects.get(contract=wired)
    for weekday in (0, 0, 2):
        ContractChildWindow.objects.create(
            contract_child=link,
            weekday=weekday,
            start_time=time(9, 0),
            end_time=time(12, 0) if weekday else time(17, 0),
        )
    data = declarations_repo.load_contract_month(wired, JULY)
    grouped = declarations_repo.group_windows_by_weekday(data.children)
    by_day = grouped[data.children[0].child_id]
    assert len(by_day[0]) == 2  # overlapping windows on one day are a legitimate union
    assert len(by_day[2]) == 1
    assert by_day[1] == []


def test_a_leave_starting_before_the_contract_is_still_only_counted_in_range(wired):
    Leave.objects.create(
        contract=wired,
        leave_type=Leave.LeaveType.PAID,
        start_date=date(2026, 6, 1),
        end_date=date(2026, 7, 31) + timedelta(days=40),
    )
    data = declarations_repo.load_contract_month(wired, JULY)
    assert len(data.leaves) == 1
    # Paid leave is already inside the mensualised base, so it takes nothing off.
    rows = declarations_repo.declarations_for(wired, JULY)
    assert rows[0].normal_hours > Decimal("0")
