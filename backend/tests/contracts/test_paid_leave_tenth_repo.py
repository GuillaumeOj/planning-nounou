"""The congés-payés « rappel de 1/10 » through the ORM boundary.

The arithmetic is unit-tested in test_paid_leave_tenth.py (the domain is pure).
Here we check the repo aggregates a whole reference year, prices the maintien, and
writes the rappel onto the closing month's declaration and nowhere else. The
cotisations-salariales rate is seeded by a migration, so the reconciliation runs.
"""

from datetime import date, time
from decimal import Decimal

import pytest

from children.models import Child
from contracts import declarations_repo
from contracts.models import (
    ContractChild,
    ContractSchedule,
    ContractTerms,
    Leave,
    MonthlyDeclaration,
    ScheduleBlock,
)

pytestmark = pytest.mark.django_db

# A reference period that the fixture's schedule and terms fully span.
ON = date(2026, 10, 15)  # → période 1 Jun 2026 – 31 May 2027
MAY = date(2027, 5, 1)
JULY = date(2026, 7, 1)


@pytest.fixture
def year_round(contract, family):
    """A Mon–Fri, 40h/week, 12 €/h contract running across the whole reference period."""
    contract.starting_date = date(2024, 1, 1)
    contract.paid_leave_days = 30
    contract.save(update_fields=["starting_date", "paid_leave_days"])
    schedule = ContractSchedule.objects.create(contract=contract, effective_from=date(2024, 1, 1))
    for weekday in range(5):
        ScheduleBlock.objects.create(
            schedule=schedule, weekday=weekday, start_time=time(9, 0), end_time=time(17, 0)
        )
    ContractTerms.objects.create(
        contract=contract, effective_from=date(2024, 1, 1), net_hourly_rate=Decimal("12.00")
    )
    child = Child.objects.create(family=family, first_name="Léa")
    ContractChild.objects.create(contract=contract, child=child)
    return contract


def take_five_weeks(contract):
    """Five weeks of paid leave inside the period — the full 25-working-day entitlement."""
    Leave.objects.create(
        contract=contract,
        leave_type=Leave.LeaveType.PAID,
        start_date=date(2026, 7, 6),  # Mon
        end_date=date(2026, 8, 7),  # Fri, five weeks later
    )


def test_reconciliation_is_per_family_with_a_real_assiette(year_round, family):
    take_five_weeks(year_round)
    by_family = declarations_repo.tenth_reconciliation(year_round, on=ON)

    assert set(by_family) == {family.id}
    rec = by_family[family.id]
    # A full year of 40h weeks priced in brut — a five-figure assiette, ten times its tenth.
    assert rec.assiette_brut > Decimal("20000")
    assert rec.tenth_brut == (rec.assiette_brut * Decimal("0.10")).quantize(Decimal("0.01"))


def test_the_tenth_beats_maintien_so_a_rappel_is_owed(year_round, family):
    take_five_weeks(year_round)
    rec = declarations_repo.tenth_reconciliation(year_round, on=ON)[family.id]
    # Classic année-complète result: 10% of 52 weeks beats the 5 weeks of maintien.
    assert rec.rappel_net > Decimal("0")
    assert rec.rappel_brut > rec.rappel_net  # reported brut, declared net


def test_no_rappel_without_a_contribution_rate(year_round, family):
    from reference.models import SalaryContributionRate

    SalaryContributionRate.objects.all().delete()
    assert declarations_repo.tenth_reconciliation(year_round, on=ON) == {}


def test_the_closing_month_declaration_carries_the_rappel(year_round, family):
    take_five_weeks(year_round)
    row = next(
        r for r in declarations_repo.declarations_for(year_round, MAY) if r.family_id == family.id
    )
    assert row.paid_leave_rappel is not None
    assert row.paid_leave_rappel > Decimal("0")


def test_an_ordinary_month_declaration_has_no_rappel(year_round, family):
    take_five_weeks(year_round)
    row = next(
        r for r in declarations_repo.declarations_for(year_round, JULY) if r.family_id == family.id
    )
    assert row.paid_leave_rappel is None
    assert row.paid_leave_tenth is None


def test_the_closing_month_declaration_carries_the_calculation_detail(year_round, family):
    take_five_weeks(year_round)
    row = next(
        r for r in declarations_repo.declarations_for(year_round, MAY) if r.family_id == family.id
    )
    detail = row.paid_leave_tenth
    assert detail is not None
    assert set(detail) == {
        "period_start",
        "period_end",
        "assiette_brut",
        "tenth_brut",
        "maintien_brut",
        "rappel_brut",
        "rappel_net",
    }
    # The detail's net rappel is the headline figure, and the tenth is 10% of the assiette.
    assert Decimal(detail["rappel_net"]) == row.paid_leave_rappel
    assert Decimal(detail["tenth_brut"]) == (
        Decimal(detail["assiette_brut"]) * Decimal("0.10")
    ).quantize(Decimal("0.01"))


def test_the_final_month_of_a_closing_contract_carries_the_rappel(year_round, family):
    # A contract ending in February closes its period then, not in May.
    year_round.ending_date = date(2027, 2, 28)
    year_round.save(update_fields=["ending_date"])
    take_five_weeks(year_round)
    row = next(
        r
        for r in declarations_repo.declarations_for(year_round, date(2027, 2, 1))
        if r.family_id == family.id
    )
    assert row.paid_leave_rappel is not None


def test_the_final_month_cashes_out_untaken_leave_as_the_compensatrice(year_round, family):
    # Contract ends in February with NO paid leave taken: the acquired entitlement is
    # owed as the indemnité compensatrice on the final month.
    year_round.ending_date = date(2027, 2, 28)
    year_round.save(update_fields=["ending_date"])
    row = next(
        r
        for r in declarations_repo.declarations_for(year_round, date(2027, 2, 1))
        if r.family_id == family.id
    )
    assert row.paid_leave_compensatrice is not None
    assert row.paid_leave_compensatrice > Decimal("0")


def test_a_regular_may_close_does_not_cash_out_untaken_leave(year_round, family):
    # An ongoing contract's May close reconciles the rappel but does NOT pay the
    # compensatrice — untaken leave is lost or carried, not cashed out mid-contract.
    row = next(
        r for r in declarations_repo.declarations_for(year_round, MAY) if r.family_id == family.id
    )
    assert row.paid_leave_rappel is not None
    assert row.paid_leave_compensatrice is None


def test_the_total_folds_the_families_into_one(year_round, family):
    take_five_weeks(year_round)
    total = declarations_repo.tenth_reconciliation_total(year_round, on=ON)
    per_family = declarations_repo.tenth_reconciliation(year_round, on=ON)[family.id]
    assert total is not None
    # One family, so the fold equals it.
    assert total.rappel_net == per_family.rappel_net
    assert total.assiette_brut == per_family.assiette_brut


def test_a_declaration_read_is_serialisable_with_the_rappel(year_round, family):
    take_five_weeks(year_round)
    row = next(
        r for r in declarations_repo.declarations_for(year_round, MAY) if r.family_id == family.id
    )
    row.refresh_from_db()
    assert isinstance(row.paid_leave_rappel, Decimal)


def test_a_month_with_no_declaration_row_still_computes(year_round, family):
    # Sanity: MonthlyDeclaration starts empty and declarations_for creates the row.
    assert not MonthlyDeclaration.objects.filter(contract=year_round, month=MAY).exists()
    declarations_repo.declarations_for(year_round, MAY)
    assert MonthlyDeclaration.objects.filter(contract=year_round, month=MAY).exists()
