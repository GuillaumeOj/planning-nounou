"""The two family-scoped aggregate endpoints: the Home dashboard and the Planning
calendar.

Each collapses a screen's worth of per-contract requests into one GET, so the two
things worth pinning down are: (1) the payload matches, contract for contract,
exactly what the individual list endpoints return for the *same acting family* —
same schedule history, same leaves, same children, and in particular the same
family-scoped exceptional hours (own + shared, never the co-employer's solo
rows); and (2) the whole thing stays query-bounded. The N+1 these endpoints exist
to kill is one request — and, server-side, a burst of queries — per contract per
resource; the guard tests assert that adding contracts costs a small *constant*
per contract, and that fattening a contract with more children / leaves /
exceptional rows costs *nothing*, because those relations are prefetched in bulk.
"""

from datetime import date, time
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone

from children.models import Child
from contracts.declarations import first_of_month
from contracts.models import (
    Contract,
    ContractChild,
    ContractSchedule,
    ContractShare,
    ContractTerms,
    ExceptionalHours,
    ExceptionalPresence,
    Leave,
    ScheduleBlock,
)
from nannies.models import Nanny
from reference.models import BankHoliday

pytestmark = pytest.mark.django_db


# --- urls ---------------------------------------------------------------------


def dashboard_url(family):
    return reverse("contracts:family-dashboard", args=[family.id])


def planning_url(family):
    return reverse("contracts:family-planning", args=[family.id])


def schedules_url(family, contract):
    return reverse("contracts:contract-schedule", args=[family.id, contract.id])


def leaves_url(family, contract):
    return reverse("contracts:contract-leaves", args=[family.id, contract.id])


def children_url(family, contract):
    return reverse("contracts:contract-children", args=[family.id, contract.id])


def hours_url(family, contract):
    return reverse("contracts:contract-exceptional-hours", args=[family.id, contract.id])


def presences_url(family, contract):
    return reverse("contracts:contract-exceptional-presences", args=[family.id, contract.id])


# --- fixtures / builders ------------------------------------------------------


def build_contract(family, name, *, starting_date=None, ending_date=None, rows=1):
    """A fully-wired contract for ``family``: two dated schedules (with blocks) and
    two dated terms, plus ``rows`` children / leaves / exceptional entries so the
    prefetch has something to collapse. ``rows`` fattens every per-contract
    collection at once."""
    nanny = Nanny.objects.create(first_name=name, last_name="Test")
    contract = Contract.objects.create(
        nanny=nanny,
        starting_date=starting_date or date(2026, 1, 5),
        ending_date=ending_date,
    )
    ContractShare.objects.create(contract=contract, family=family, is_originator=True)
    for effective_from in (date(2026, 1, 5), date(2026, 3, 1)):
        schedule = ContractSchedule.objects.create(contract=contract, effective_from=effective_from)
        for weekday in range(5):
            ScheduleBlock.objects.create(
                schedule=schedule, weekday=weekday, start_time=time(9, 0), end_time=time(17, 0)
            )
        ContractTerms.objects.create(
            contract=contract, effective_from=effective_from, net_hourly_rate=Decimal("12.00")
        )
    for i in range(rows):
        child = Child.objects.create(family=family, first_name=f"{name}-kid{i}")
        ContractChild.objects.create(contract=contract, child=child)
        Leave.objects.create(
            contract=contract,
            leave_type=Leave.LeaveType.UNPAID,
            start_date=date(2026, 6, 1 + i),
            end_date=date(2026, 6, 1 + i),
            portion=Leave.Portion.HOURLY,
            hours=Decimal("2"),
        )
        ExceptionalHours.objects.create(
            contract=contract,
            family=family,
            start_date=date(2026, 7, 14 + i),
            start_time=time(18, 30),
            end_date=date(2026, 7, 14 + i),
            end_time=time(20, 0),
        )
        ExceptionalPresence.objects.create(
            contract=contract,
            child=child,
            date=date(2026, 7, 14 + i),
            start_time=time(8, 0),
            end_time=time(9, 0),
        )
    return contract


def query_count(client, url, params=None):
    with CaptureQueriesContext(connection) as ctx:
        resp = client.get(url, params or {})
    assert resp.status_code == 200, resp.data
    return len(ctx), resp


# --- dashboard: shape ---------------------------------------------------------


def test_dashboard_returns_balance_and_recent_declarations(client, owner, family):
    build_contract(family, "Marie")
    client.force_authenticate(user=owner)
    resp = client.get(dashboard_url(family))
    assert resp.status_code == 200, resp.data

    assert len(resp.data["contracts"]) == 1
    contract = resp.data["contracts"][0]
    # Contract identity is the same ContractSerializer shape as the list endpoint.
    assert set(contract).issuperset({"id", "nanny", "current_schedule", "families"})
    # Plus the two dashboard aggregates.
    balance = contract["paid_leave_balance"]
    assert set(balance) == {
        "period_start",
        "period_end",
        "total_days",
        "accrued",
        "taken",
        "remaining",
    }
    recent = contract["recent_declarations"]
    assert recent, "a live contract has recent declarations"
    for row in recent:
        assert set(row) == {"month", "net_salary", "status"}
        assert row["status"] in {"draft", "filed"}


def test_dashboard_recent_declarations_only_covers_live_months(client, owner, family):
    """A month before the contract started (or after it ended) has nothing to
    declare — the same YYYY-MM comparison the client's RecentDeclarations makes."""
    today = timezone.localdate()
    # Started last month, so among the last 4 months only this one and last one
    # are live.
    started = first_of_month(today, -1)
    build_contract(family, "Marie", starting_date=started)
    client.force_authenticate(user=owner)

    resp = client.get(dashboard_url(family), {"months": 4})
    months = [r["month"] for r in resp.data["contracts"][0]["recent_declarations"]]
    expected = [today.strftime("%Y-%m"), started.strftime("%Y-%m")]
    # Most recent first, and nothing before the contract started.
    assert months == expected


def test_dashboard_respects_the_months_param_and_clamps_it(client, owner, family):
    build_contract(family, "Marie", starting_date=date(2020, 1, 1))
    client.force_authenticate(user=owner)

    assert (
        len(
            client.get(dashboard_url(family), {"months": 1}).data["contracts"][0][
                "recent_declarations"
            ]
        )
        == 1
    )
    assert (
        len(
            client.get(dashboard_url(family), {"months": 3}).data["contracts"][0][
                "recent_declarations"
            ]
        )
        == 3
    )
    # Clamped to 12, not 999.
    assert (
        len(
            client.get(dashboard_url(family), {"months": 999}).data["contracts"][0][
                "recent_declarations"
            ]
        )
        == 12
    )


def test_dashboard_is_scoped_to_the_acting_family(client, owner, family, other_family):
    build_contract(family, "Ours")
    build_contract(other_family, "Theirs")
    client.force_authenticate(user=owner)

    resp = client.get(dashboard_url(family))
    nannies = {c["nanny"]["first_name"] for c in resp.data["contracts"]}
    assert nannies == {"Ours"}


def test_dashboard_requires_family_access(client, outsider, family):
    build_contract(family, "Marie")
    client.force_authenticate(user=outsider)
    assert client.get(dashboard_url(family)).status_code == 403


def test_dashboard_recent_declaration_matches_the_declarations_endpoint(client, owner, family):
    """The recent row is the acting family's own declaration for the month — the
    very row the declarations list endpoint hands back."""
    contract = build_contract(family, "Marie")
    client.force_authenticate(user=owner)
    this_month = timezone.localdate().strftime("%Y-%m")

    dash = client.get(dashboard_url(family), {"months": 1}).data
    recent = dash["contracts"][0]["recent_declarations"][0]

    declarations = reverse("contracts:contract-declarations", args=[family.id, contract.id])
    listed = client.get(declarations, {"month": this_month}).data[0]
    assert recent["month"] == this_month
    assert recent["net_salary"] == listed["net_salary"]
    assert recent["status"] == listed["status"]


# --- planning: shape / parity with the list endpoints -------------------------


def test_planning_returns_full_histories_and_holidays(client, owner, family):
    build_contract(family, "Marie", rows=2)
    client.force_authenticate(user=owner)
    resp = client.get(planning_url(family), {"month": "2026-07"})
    assert resp.status_code == 200, resp.data

    assert set(resp.data) == {"contracts", "holidays"}
    contract = resp.data["contracts"][0]
    assert set(contract).issuperset(
        {
            "id",
            "nanny",
            "starting_date",
            "ending_date",
            "split_method",
            "schedule_history",
            "leaves",
            "exceptional_hours",
            "exceptional_presences",
            "children",
        }
    )
    assert len(contract["schedule_history"]) == 2  # full history, both versions
    assert len(contract["children"]) == 2
    assert len(contract["leaves"]) == 2


def test_planning_collections_match_the_list_endpoints(client, owner, family):
    """Contract for contract, the aggregate returns exactly what each per-resource
    list endpoint returns for the same acting family."""
    contract = build_contract(family, "Marie", rows=2)
    client.force_authenticate(user=owner)

    plan = client.get(planning_url(family), {"month": "2026-07"}).data["contracts"][0]

    def ids(url):
        return {r["id"] for r in client.get(url).data}

    assert {s["id"] for s in plan["schedule_history"]} == ids(schedules_url(family, contract))
    assert {leave["id"] for leave in plan["leaves"]} == ids(leaves_url(family, contract))
    assert {c["id"] for c in plan["children"]} == ids(children_url(family, contract))
    assert {h["id"] for h in plan["exceptional_hours"]} == ids(hours_url(family, contract))
    assert {p["id"] for p in plan["exceptional_presences"]} == ids(presences_url(family, contract))


def test_planning_exceptional_hours_are_family_scoped_like_the_list_endpoint(
    client, owner, family, other_family
):
    """Own rows plus every family's *shared* care, never the co-employer's solo
    rows — exactly the ExceptionalHoursViewSet read scope."""
    contract = build_contract(family, "Marie", rows=0)
    ContractShare.objects.create(contract=contract, family=other_family)

    mine = ExceptionalHours.objects.create(
        contract=contract,
        family=family,
        start_date=date(2026, 7, 10),
        start_time=time(18, 30),
        end_date=date(2026, 7, 10),
        end_time=time(20, 0),
    )
    theirs_shared = ExceptionalHours.objects.create(
        contract=contract,
        family=other_family,
        is_shared=True,
        start_date=date(2026, 7, 11),
        start_time=time(18, 30),
        end_date=date(2026, 7, 11),
        end_time=time(20, 0),
    )
    theirs_solo = ExceptionalHours.objects.create(
        contract=contract,
        family=other_family,
        is_shared=False,
        start_date=date(2026, 7, 12),
        start_time=time(18, 30),
        end_date=date(2026, 7, 12),
        end_time=time(20, 0),
    )

    client.force_authenticate(user=owner)
    plan = client.get(planning_url(family), {"month": "2026-07"}).data["contracts"][0]
    visible = {h["id"] for h in plan["exceptional_hours"]}
    assert visible == {str(mine.id), str(theirs_shared.id)}
    assert str(theirs_solo.id) not in visible

    # And it is the same set the list endpoint returns.
    listed = {r["id"] for r in client.get(hours_url(family, contract)).data}
    assert visible == listed


def test_planning_holidays_fall_within_the_month_grid(client, owner, family):
    """The grid spans whole Monday-first weeks around the month; July 2026 runs
    Mon 2026-06-29 → Sun 2026-08-02."""
    build_contract(family, "Marie", rows=0)
    in_grid_edge = BankHoliday.objects.create(name="Grid start", date=date(2026, 6, 29))
    in_grid_mid = BankHoliday.objects.create(name="Bastille", date=date(2026, 7, 14))
    before_grid = BankHoliday.objects.create(name="Too early", date=date(2026, 6, 15))
    after_grid = BankHoliday.objects.create(name="Too late", date=date(2026, 8, 3))

    client.force_authenticate(user=owner)
    resp = client.get(planning_url(family), {"month": "2026-07"})
    returned = {h["id"] for h in resp.data["holidays"]}
    assert str(in_grid_edge.id) in returned
    assert str(in_grid_mid.id) in returned
    assert str(before_grid.id) not in returned
    assert str(after_grid.id) not in returned


def test_planning_defaults_to_the_current_month(client, owner, family):
    build_contract(family, "Marie", rows=0)
    client.force_authenticate(user=owner)
    assert client.get(planning_url(family)).status_code == 200


def test_planning_rejects_a_bad_month(client, owner, family):
    build_contract(family, "Marie", rows=0)
    client.force_authenticate(user=owner)
    assert client.get(planning_url(family), {"month": "juillet"}).status_code == 400


def test_planning_requires_family_access(client, outsider, family):
    build_contract(family, "Marie", rows=0)
    client.force_authenticate(user=outsider)
    assert client.get(planning_url(family)).status_code == 403


# --- query-count guards: the whole point --------------------------------------
#
# The endpoints must not run a query per contract's related row. Two invariants
# prove it: each extra contract costs a small *constant* number of queries, and
# that constant is the *same* whether the contract is thin (one row per
# collection) or fat (many) — the per-contract relations are prefetched in bulk.


def test_dashboard_query_count_does_not_scale_with_per_contract_data(client, owner, family):
    client.force_authenticate(user=owner)
    url = dashboard_url(family)
    params = {"months": 2}

    build_contract(family, "A", rows=1)
    n1, _ = query_count(client, url, params)

    # A second contract, fat with six rows in every collection.
    build_contract(family, "B", rows=6)
    n2, _ = query_count(client, url, params)

    # A third contract, thin.
    build_contract(family, "C", rows=1)
    n3, _ = query_count(client, url, params)

    per_fat = n2 - n1
    per_thin = n3 - n2
    # The fat contract's extra children / leaves / exceptional rows add no queries
    # of their own: a fat contract costs exactly what a thin one does.
    assert per_fat == per_thin
    # And that per-contract cost is a small constant (recompute + balance), not a
    # query per related row. It was 37 at months=2 when written.
    assert per_thin <= 40


def test_planning_query_count_does_not_scale_with_per_contract_data(client, owner, family):
    client.force_authenticate(user=owner)
    url = planning_url(family)
    params = {"month": "2026-07"}

    build_contract(family, "A", rows=1)
    n1, _ = query_count(client, url, params)

    build_contract(family, "B", rows=6)  # fat
    n2, _ = query_count(client, url, params)

    build_contract(family, "C", rows=1)  # thin
    n3, _ = query_count(client, url, params)

    per_fat = n2 - n1
    per_thin = n3 - n2
    # Fattening a contract adds no queries; each contract costs a small constant
    # (its two current-snapshot lookups plus the schedule history), never one per
    # child / leave / exceptional row. It was 5 per contract when written.
    assert per_fat == per_thin
    assert per_thin <= 8


def test_planning_query_count_is_flat_across_a_batch_of_contracts(client, owner, family):
    """A stronger statement of the same thing: five fat contracts in one payload
    stay well within a fixed budget — no N+1 blow-up."""
    client.force_authenticate(user=owner)
    for i in range(5):
        build_contract(family, f"C{i}", rows=4)
    count, resp = query_count(client, planning_url(family), {"month": "2026-07"})
    assert len(resp.data["contracts"]) == 5
    # 14 fixed prefetch/overhead + ~5 per contract. A generous, stable ceiling.
    assert count <= 45
