"""The paid-leave balance endpoint — wiring and access only.

The arithmetic lives in test_paid_leave.py (the domain is pure). Here we check
that the route resolves, hands back the six figures, and is a read scoped to the
families sharing the contract.
"""

from datetime import date, time, timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from tracking.models import ContractSchedule, Leave, ScheduleBlock
from tracking.paid_leave import reference_period

pytestmark = pytest.mark.django_db


def paid_leave_url(family, contract):
    return reverse("tracking:contract-paid-leave", args=[family.id, contract.id])


@pytest.fixture
def scheduled(contract):
    """A contract with a Monday–Friday week and an agreed 30 days of leave."""
    contract.paid_leave_days = 30
    contract.save(update_fields=["paid_leave_days"])
    schedule = ContractSchedule.objects.create(contract=contract, effective_from=date(2020, 1, 1))
    for weekday in range(5):
        ScheduleBlock.objects.create(
            schedule=schedule, weekday=weekday, start_time=time(9, 0), end_time=time(17, 0)
        )
    return contract


def test_paid_leave_returns_the_six_figures(client, owner, family, scheduled):
    client.force_authenticate(user=owner)
    response = client.get(paid_leave_url(family, scheduled))

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "period_start",
        "period_end",
        "total_days",
        "accrued",
        "taken",
        "remaining",
    }
    assert body["total_days"] == "30.00"
    # remaining is always accrued − taken, whatever today makes those.
    assert float(body["remaining"]) == float(body["accrued"]) - float(body["taken"])


def test_paid_leave_counts_a_paid_leave_this_period(client, owner, family, scheduled):
    period_start, _ = reference_period(timezone.localdate())
    # Any Monday inside the period is a scheduled working day; walk to the first.
    monday = period_start
    while monday.weekday() != 0:
        monday += timedelta(days=1)
    Leave.objects.create(
        contract=scheduled,
        leave_type=Leave.LeaveType.PAID,
        start_date=monday,
        end_date=monday,
    )
    client.force_authenticate(user=owner)
    body = client.get(paid_leave_url(family, scheduled)).json()
    assert body["taken"] == "1.00"


def test_paid_leave_is_denied_to_a_non_member(client, outsider, family, scheduled):
    client.force_authenticate(user=outsider)
    response = client.get(paid_leave_url(family, scheduled))
    assert response.status_code in (403, 404)
