"""The family-scoped payment-simulation endpoint.

One GET returns, per shared contract, a month-by-month projection of what the acting
family pays. The things worth pinning: the payload shape, that it is scoped to the
acting family, that the window params (and their defaults / validation) behave, and
that the figures are the acting family's own outlay.
"""

from datetime import date, time
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from children.models import Child
from contracts.models import (
    ContractChild,
    ContractSchedule,
    ContractTerms,
    ExceptionalHours,
    Leave,
    ScheduleBlock,
)

pytestmark = pytest.mark.django_db

MONTH_FIELDS = {
    "month",
    "net_wage",
    "transport",
    "mileage",
    "benefits_in_kind",
    "paid_leave_rappel",
    "total",
}


def simulation_url(family):
    return reverse("contracts:family-simulation", args=[family.id])


def wire(contract, family, *, rate="12.00", transport="50.00", benefits="30.00"):
    """Give a contract a Mon–Fri 40h schedule, terms, and a child in ``family``."""
    schedule = ContractSchedule.objects.create(
        contract=contract, effective_from=contract.starting_date
    )
    for weekday in range(5):
        ScheduleBlock.objects.create(
            schedule=schedule, weekday=weekday, start_time=time(9, 0), end_time=time(17, 0)
        )
    ContractTerms.objects.create(
        contract=contract,
        effective_from=contract.starting_date,
        net_hourly_rate=Decimal(rate),
        transport_fee=Decimal(transport),
        benefits_in_kind=Decimal(benefits),
    )
    child = Child.objects.create(family=family, first_name="Léa")
    ContractChild.objects.create(contract=contract, child=child)
    return contract


def fatten(contract, family, rows):
    """Pile ``rows`` extra children, leaves and exceptional entries onto a contract, so
    a query-count guard can prove the per-contract cost does not scale with them."""
    for i in range(rows):
        child = Child.objects.create(family=family, first_name=f"kid{i}")
        ContractChild.objects.create(contract=contract, child=child)
        Leave.objects.create(
            contract=contract,
            leave_type=Leave.LeaveType.PAID,
            start_date=date(2026, 7, 6 + i),
            end_date=date(2026, 7, 6 + i),
        )
        ExceptionalHours.objects.create(
            contract=contract,
            family=family,
            start_date=date(2026, 8, 3 + i),
            start_time=time(18, 30),
            end_date=date(2026, 8, 3 + i),
            end_time=time(20, 0),
        )


def test_returns_a_window_and_per_contract_month_breakdowns(client, owner, family, make_contract):
    wire(make_contract(family, starting_date=date(2024, 1, 1)), family)
    client.force_authenticate(user=owner)

    resp = client.get(simulation_url(family), {"from": "2026-06", "to": "2027-05"})
    assert resp.status_code == 200, resp.data
    assert set(resp.data) == {"period_start", "period_end", "contracts"}
    assert resp.data["period_start"] == "2026-06-01"

    contract = resp.data["contracts"][0]
    assert set(contract).issuperset({"id", "nanny", "months", "total"})
    months = contract["months"]
    assert len(months) == 12
    for row in months:
        assert set(row) == MONTH_FIELDS
    # The footer total is the sum of every month's total.
    assert Decimal(contract["total"]) == sum(Decimal(m["total"]) for m in months)


def test_defaults_to_the_current_reference_period(client, owner, family, make_contract):
    wire(make_contract(family, starting_date=date(2020, 1, 1)), family)
    client.force_authenticate(user=owner)

    resp = client.get(simulation_url(family))
    assert resp.status_code == 200
    # 1 June–31 May of the reference period around today: twelve months, starting in June.
    assert resp.data["period_start"].endswith("-06-01")
    assert len(resp.data["contracts"][0]["months"]) == 12


def test_a_lone_from_rolls_a_year_forward(client, owner, family, make_contract):
    wire(make_contract(family, starting_date=date(2020, 1, 1)), family)
    client.force_authenticate(user=owner)

    resp = client.get(simulation_url(family), {"from": "2026-07"})
    assert resp.status_code == 200
    months = [m["month"] for m in resp.data["contracts"][0]["months"]]
    assert months[0] == "2026-07"
    assert months[-1] == "2027-06"
    assert len(months) == 12


def test_the_figures_are_the_acting_familys_outlay(client, owner, family, make_contract):
    wire(make_contract(family, starting_date=date(2024, 1, 1)), family)
    client.force_authenticate(user=owner)

    month = client.get(simulation_url(family), {"from": "2026-06", "to": "2026-06"}).data[
        "contracts"
    ][0]["months"][0]
    assert Decimal(month["transport"]) == Decimal("50.00")
    assert Decimal(month["benefits_in_kind"]) == Decimal("30.00")
    assert Decimal(month["net_wage"]) > Decimal("1500")


def test_is_scoped_to_the_acting_family(client, owner, family, other_family, make_contract):
    wire(make_contract(family, first_name="Ours", starting_date=date(2024, 1, 1)), family)
    wire(
        make_contract(other_family, first_name="Theirs", starting_date=date(2024, 1, 1)),
        other_family,
    )
    client.force_authenticate(user=owner)

    resp = client.get(simulation_url(family))
    nannies = {c["nanny"]["first_name"] for c in resp.data["contracts"]}
    assert nannies == {"Ours"}


def test_requires_family_access(client, outsider, family, make_contract):
    wire(make_contract(family, starting_date=date(2024, 1, 1)), family)
    client.force_authenticate(user=outsider)
    assert client.get(simulation_url(family)).status_code == 403


def test_rejects_a_bad_month(client, owner, family, make_contract):
    wire(make_contract(family, starting_date=date(2024, 1, 1)), family)
    client.force_authenticate(user=owner)
    assert client.get(simulation_url(family), {"from": "juin"}).status_code == 400


def test_rejects_an_inverted_window(client, owner, family, make_contract):
    wire(make_contract(family, starting_date=date(2024, 1, 1)), family)
    client.force_authenticate(user=owner)
    resp = client.get(simulation_url(family), {"from": "2027-05", "to": "2026-06"})
    assert resp.status_code == 400


def test_rejects_an_over_long_window(client, owner, family, make_contract):
    wire(make_contract(family, starting_date=date(2024, 1, 1)), family)
    client.force_authenticate(user=owner)
    resp = client.get(simulation_url(family), {"from": "2026-01", "to": "2030-01"})
    assert resp.status_code == 400


def test_query_count_does_not_scale_with_per_contract_data(client, owner, family, make_contract):
    """Like the dashboard / planning aggregates, each extra contract costs a small
    *constant* number of queries — the same whether the contract is thin or fat — because
    simulate_range loads each contract's whole window in a fixed set of bulk queries, not
    one per child / leave / exceptional row."""
    client.force_authenticate(user=owner)
    url = simulation_url(family)
    params = {"from": "2026-06", "to": "2027-05"}

    def query_count():
        with CaptureQueriesContext(connection) as ctx:
            resp = client.get(url, params)
        assert resp.status_code == 200, resp.data
        return len(ctx)

    wire(make_contract(family, first_name="A", starting_date=date(2024, 1, 1)), family)
    n1 = query_count()

    fatten(
        wire(make_contract(family, first_name="B", starting_date=date(2024, 1, 1)), family),
        family,
        rows=6,
    )
    n2 = query_count()

    wire(make_contract(family, first_name="C", starting_date=date(2024, 1, 1)), family)
    n3 = query_count()

    per_fat = n2 - n1
    per_thin = n3 - n2
    # A fat contract's extra rows add no queries of their own; it costs what a thin one does.
    assert per_fat == per_thin
    # And that per-contract cost is a small constant (the window load, its kilométrage and
    # the closing-month reconciliation), not a query per related row.
    assert per_thin <= 30
