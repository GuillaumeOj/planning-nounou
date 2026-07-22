"""The payment simulation through the ORM boundary: :func:`simulate_range`.

The arithmetic of a single month is exercised by the declarations tests; here we
check the range machinery — that it returns one entry per live month, prices each
month like a real declaration, folds the congés-payés « rappel de 1/10 » into the
reference period's closing month and nowhere else, and skips months outside the
contract's life.
"""

from datetime import date, time
from decimal import Decimal

import pytest

from children.models import Child
from contracts import declarations_repo as repo
from contracts.models import (
    ContractChild,
    ContractSchedule,
    ContractTerms,
    Leave,
    MonthlyDeclaration,
    ScheduleBlock,
)

pytestmark = pytest.mark.django_db

PERIOD_START = date(2026, 6, 1)
PERIOD_END = date(2027, 5, 1)
MAY = date(2027, 5, 1)


@pytest.fixture
def year_round(contract, family):
    """A Mon–Fri, 40h/week, 12 €/h contract with transport & benefits, running across
    the whole reference period."""
    contract.starting_date = date(2024, 1, 1)
    contract.paid_leave_days = 30
    contract.save(update_fields=["starting_date", "paid_leave_days"])
    schedule = ContractSchedule.objects.create(contract=contract, effective_from=date(2024, 1, 1))
    for weekday in range(5):
        ScheduleBlock.objects.create(
            schedule=schedule, weekday=weekday, start_time=time(9, 0), end_time=time(17, 0)
        )
    ContractTerms.objects.create(
        contract=contract,
        effective_from=date(2024, 1, 1),
        net_hourly_rate=Decimal("12.00"),
        transport_fee=Decimal("50.00"),
        benefits_in_kind=Decimal("30.00"),
    )
    child = Child.objects.create(family=family, first_name="Léa")
    ContractChild.objects.create(contract=contract, child=child)
    return contract


def take_five_weeks(contract):
    Leave.objects.create(
        contract=contract,
        leave_type=Leave.LeaveType.PAID,
        start_date=date(2026, 7, 6),
        end_date=date(2026, 8, 7),
    )


def test_returns_one_entry_per_month_of_the_reference_period(year_round, family):
    rows = repo.simulate_range(year_round, PERIOD_START, PERIOD_END)[family.id]
    assert [r.month for r in rows] == [
        repo.dec.first_of_month(PERIOD_START, offset) for offset in range(12)
    ]


def test_each_month_carries_the_outlay_components(year_round, family):
    rows = repo.simulate_range(year_round, PERIOD_START, PERIOD_END)[family.id]
    june = rows[0].breakdown
    # A full 40h month priced at 12 €/h, plus the fixed transport and benefits from terms.
    assert june.net_wage > Decimal("1500")
    assert june.transport == Decimal("50.00")
    assert june.benefits_in_kind == Decimal("30.00")
    assert june.total == (
        june.net_wage + june.transport + june.mileage + june.benefits_in_kind
    )  # no rappel in June


def test_the_rappel_lands_only_on_the_closing_month(year_round, family):
    take_five_weeks(year_round)
    rows = repo.simulate_range(year_round, PERIOD_START, PERIOD_END)[family.id]
    by_month = {r.month: r.breakdown for r in rows}
    # A full-year 40h contract: the tenth beats five weeks of maintien, so May owes a rappel.
    assert by_month[MAY].paid_leave_rappel > Decimal("0")
    # And it is inside May's total, over and above the ordinary wage.
    assert by_month[MAY].total > by_month[MAY].net_wage + by_month[MAY].benefits_in_kind
    # Every other month is rappel-free.
    for month, breakdown in by_month.items():
        if month != MAY:
            assert breakdown.paid_leave_rappel == Decimal("0")


def test_the_rappel_matches_the_reconciliation(year_round, family):
    take_five_weeks(year_round)
    rows = repo.simulate_range(year_round, PERIOD_START, PERIOD_END)[family.id]
    may = next(r for r in rows if r.month == MAY)
    rec = repo.tenth_reconciliation(year_round, on=MAY)[family.id]
    assert may.breakdown.paid_leave_rappel == rec.rappel_net


def test_months_outside_the_contract_life_are_skipped(family, make_contract):
    """A contract live only from March onward has no simulated month before March."""
    contract = make_contract(family, starting_date=date(2027, 3, 1))
    schedule = ContractSchedule.objects.create(contract=contract, effective_from=date(2027, 3, 1))
    for weekday in range(5):
        ScheduleBlock.objects.create(
            schedule=schedule, weekday=weekday, start_time=time(9, 0), end_time=time(17, 0)
        )
    ContractTerms.objects.create(
        contract=contract, effective_from=date(2027, 3, 1), net_hourly_rate=Decimal("12.00")
    )
    child = Child.objects.create(family=family, first_name="Léa")
    ContractChild.objects.create(contract=contract, child=child)

    rows = repo.simulate_range(contract, PERIOD_START, PERIOD_END)[family.id]
    assert [r.month for r in rows] == [date(2027, 3, 1), date(2027, 4, 1), date(2027, 5, 1)]


def test_past_month_mileage_reflects_the_kilometres_on_file(year_round, family):
    """A declaration's entered kilométrage prices that month's mileage; a future month,
    having none, projects zero."""
    # File June's declaration, then set a kilométrage on the acting family's row.
    repo.declarations_for(year_round, date(2026, 6, 1))
    ContractTerms.objects.filter(contract=year_round).update(mileage_rate=Decimal("0.50"))
    MonthlyDeclaration.objects.filter(
        contract=year_round, family=family, month=date(2026, 6, 1)
    ).update(kilometers=Decimal("100"))

    rows = repo.simulate_range(year_round, PERIOD_START, PERIOD_END)[family.id]
    by_month = {r.month: r.breakdown for r in rows}
    assert by_month[date(2026, 6, 1)].mileage == Decimal("50.00")  # 100 km × 0.50
    assert by_month[MAY].mileage == Decimal("0")  # future month, nothing on file
