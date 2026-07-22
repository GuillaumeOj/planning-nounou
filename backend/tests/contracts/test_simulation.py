"""The pure payment-simulation domain: folding a month's pay result into an outlay.

No database — :mod:`contracts.simulation` is Django-free, like the declarations and
paid-leave domains. It checks the one thing the module decides: which of a
``FamilyResult``'s figures count toward what a family pays, and that the total sums
them (the rappel included).
"""

from decimal import Decimal
from uuid import uuid4

from contracts.declarations import FamilyResult
from contracts.simulation import breakdown_of


def make_result(
    *,
    total_amount="1000.00",
    transport_amount="50.00",
    mileage_amount="12.00",
    benefits_in_kind_amount="30.00",
    net_salary="900.00",
) -> FamilyResult:
    """A FamilyResult with only the fields the breakdown reads set meaningfully."""
    return FamilyResult(
        family_id=uuid4(),
        normal_hours=Decimal("0"),
        hours_25=Decimal("0"),
        hours_50=Decimal("0"),
        night_count=0,
        night_indemnity=Decimal("0"),
        holiday_majoration=Decimal("0"),
        transport_amount=Decimal(transport_amount),
        benefits_in_kind_amount=Decimal(benefits_in_kind_amount),
        kilometers=Decimal("0"),
        mileage_amount=Decimal(mileage_amount),
        net_salary=Decimal(net_salary),
        total_amount=Decimal(total_amount),
        net_hourly_rate=Decimal("12.00"),
        night_presence_rate=Decimal("0"),
        mileage_rate=Decimal("0"),
        rate_periods=(),
        warnings=(),
    )


def test_breakdown_reads_the_outlay_components():
    breakdown = breakdown_of(make_result())
    # The net wage is total_amount (salary + night + holiday majoration), not net_salary.
    assert breakdown.net_wage == Decimal("1000.00")
    assert breakdown.transport == Decimal("50.00")
    assert breakdown.mileage == Decimal("12.00")
    assert breakdown.benefits_in_kind == Decimal("30.00")


def test_total_sums_every_component_including_the_rappel():
    breakdown = breakdown_of(make_result(), paid_leave_rappel=Decimal("120.00"))
    assert breakdown.paid_leave_rappel == Decimal("120.00")
    assert breakdown.total == Decimal("1000.00") + Decimal("50.00") + Decimal("12.00") + Decimal(
        "30.00"
    ) + Decimal("120.00")


def test_the_rappel_defaults_to_zero_and_stays_out_of_an_ordinary_month():
    breakdown = breakdown_of(make_result())
    assert breakdown.paid_leave_rappel == Decimal("0")
    assert breakdown.total == Decimal("1092.00")  # no rappel added
