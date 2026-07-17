import datetime
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db.utils import IntegrityError
from django.utils import timezone

from tracking.models import (
    ContractSchedule,
    ContractTerms,
    MinimumWage,
    MonthlyDeclaration,
    Nanny,
    ScheduleBlock,
)

pytestmark = pytest.mark.django_db

TODAY = datetime.date(2026, 6, 1)


def test_nanny_str_is_full_name():
    nanny = Nanny.objects.create(first_name="Marie", last_name="Dupont")
    assert str(nanny) == "Marie Dupont"


def test_nannies_ordered_by_last_then_first_name():
    b = Nanny.objects.create(first_name="Zoe", last_name="Bernard")
    a = Nanny.objects.create(first_name="Anne", last_name="Bernard")
    c = Nanny.objects.create(first_name="Amy", last_name="Colin")
    assert list(Nanny.objects.all()) == [a, b, c]


def test_contract_str(contract):
    assert str(contract).startswith("Marie Dupont")


def test_current_terms_picks_latest_effective_and_ignores_future(contract):
    old = ContractTerms.objects.create(
        contract=contract, effective_from=datetime.date(2026, 1, 1), net_hourly_rate=Decimal("11")
    )
    current = ContractTerms.objects.create(
        contract=contract, effective_from=datetime.date(2026, 5, 1), net_hourly_rate=Decimal("12")
    )
    ContractTerms.objects.create(
        contract=contract, effective_from=datetime.date(2026, 12, 1), net_hourly_rate=Decimal("13")
    )
    assert contract.current_terms(on=TODAY) == current
    assert contract.current_terms(on=datetime.date(2026, 1, 15)) == old


def test_current_terms_none_when_empty(contract):
    assert contract.current_terms(on=TODAY) is None


def test_current_schedule_picks_latest_effective(contract):
    ContractSchedule.objects.create(contract=contract, effective_from=datetime.date(2026, 1, 1))
    current = ContractSchedule.objects.create(
        contract=contract, effective_from=datetime.date(2026, 5, 1)
    )
    assert contract.current_schedule(on=TODAY) == current


def test_terms_unique_per_effective_date(contract):
    ContractTerms.objects.create(
        contract=contract, effective_from=TODAY, net_hourly_rate=Decimal("11")
    )
    with pytest.raises(IntegrityError):
        ContractTerms.objects.create(
            contract=contract, effective_from=TODAY, net_hourly_rate=Decimal("12")
        )


def test_minimum_wage_applicable_on():
    # The 2025-01-01 → 10.07 row is seeded by migration 0003; add a later one.
    MinimumWage.objects.create(
        effective_from=datetime.date(2026, 1, 1), net_hourly_rate=Decimal("11.00")
    )
    assert MinimumWage.applicable_on(datetime.date(2025, 6, 1)) == Decimal("10.07")
    assert MinimumWage.applicable_on(datetime.date(2026, 6, 1)) == Decimal("11.00")
    assert MinimumWage.applicable_on(datetime.date(2024, 1, 1)) is None


def test_schedule_block_clean_rejects_end_before_start(contract):
    schedule = ContractSchedule.objects.create(contract=contract, effective_from=TODAY)
    block = ScheduleBlock(
        schedule=schedule,
        weekday=ScheduleBlock.Weekday.MONDAY,
        start_time=datetime.time(18, 0),
        end_time=datetime.time(8, 0),
    )
    with pytest.raises(ValidationError):
        block.clean()


# --- the declaration edit window ---------------------------------------------


def _declaration(month, status=MonthlyDeclaration.Status.DRAFT):
    # Unsaved: editable_until/is_editable are pure functions of month and status.
    return MonthlyDeclaration(month=month, status=status)


def test_editable_until_is_the_end_of_the_month_two_months_later():
    assert _declaration(datetime.date(2026, 1, 1)).editable_until == datetime.date(2026, 3, 31)


def test_editable_until_wraps_the_year():
    assert _declaration(datetime.date(2026, 11, 1)).editable_until == datetime.date(2027, 1, 31)


def test_a_draft_is_always_editable_and_never_frozen():
    old_draft = _declaration(datetime.date(2000, 1, 1))
    assert old_draft.is_editable
    assert not old_draft.is_frozen


def test_a_filed_recent_month_stays_editable_in_place():
    this_month = timezone.localdate().replace(day=1)
    filed = _declaration(this_month, status=MonthlyDeclaration.Status.FILED)
    assert filed.is_editable
    assert not filed.is_frozen


def test_a_filed_old_month_is_frozen():
    filed = _declaration(datetime.date(2000, 1, 1), status=MonthlyDeclaration.Status.FILED)
    assert filed.is_frozen
    assert not filed.is_editable
