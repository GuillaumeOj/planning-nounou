"""The declaration API, and the permission shape it introduces.

ExceptionalHours and MonthlyDeclaration are private to the family that filed
them — a shape nothing else here has. The two employers share a nanny, not a
payslip: what B pays her, and which evenings B kept her late, are B's.

The subtlety these tests exist to pin down is that A's numbers still *depend* on
B's rows — the split bands the nanny's whole week before dividing it — while A
never *sees* them. That dependency is settled server-side in declarations.py,
which reads the database directly. So the sum invariant is asserted against the
database, and the API is asserted to hand back one family's row and 404 the
other's. A 403 would confirm the row exists, which is the thing being hidden.

LeaveViewSet is contract-wide for both reads and writes — right for a day off,
which belongs to the nanny — so copying it here is the bug these tests catch.
"""

from datetime import date, time
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone

from accounts.models import Child
from tracking.declarations import first_of_month
from tracking.models import (
    ContractChild,
    ContractSchedule,
    ContractShare,
    ContractTerms,
    ExceptionalHours,
    MonthlyDeclaration,
    ScheduleBlock,
)

pytestmark = pytest.mark.django_db


def children_url(family, contract):
    return reverse("tracking:contract-children", args=[family.id, contract.id])


def hours_url(family, contract):
    return reverse("tracking:contract-exceptional-hours", args=[family.id, contract.id])


def hour_url(family, contract, pk):
    return reverse("tracking:contract-exceptional-hour", args=[family.id, contract.id, pk])


def declarations_url(family, contract):
    return reverse("tracking:contract-declarations", args=[family.id, contract.id])


def file_url(family, contract, pk):
    return reverse("tracking:contract-declaration-file", args=[family.id, contract.id, pk])


@pytest.fixture
def wired(contract, family):
    schedule = ContractSchedule.objects.create(contract=contract, effective_from=date(2026, 1, 5))
    for weekday in range(5):
        ScheduleBlock.objects.create(
            schedule=schedule, weekday=weekday, start_time=time(9, 0), end_time=time(17, 0)
        )
    ContractTerms.objects.create(
        contract=contract, effective_from=date(2026, 1, 5), net_hourly_rate=Decimal("12.00")
    )
    return contract


@pytest.fixture
def shared(wired, other_family, outsider):
    """A garde partagée: both families on one contract, each an owner of its own."""
    ContractShare.objects.create(contract=wired, family=other_family)
    return wired


def post_hours(client, family, contract, **fields):
    fields.setdefault("kind", ExceptionalHours.Kind.EFFECTIVE)
    fields.setdefault("start_date", "2026-07-14")
    fields.setdefault("start_time", "18:30")
    fields.setdefault("end_date", "2026-07-14")
    fields.setdefault("end_time", "20:00")
    return client.post(hours_url(family, contract), fields, format="json")


# --- contract children --------------------------------------------------------


def test_a_child_can_be_put_on_the_contract_with_windows(client, owner, family, wired):
    client.force_authenticate(user=owner)
    child = Child.objects.create(family=family, first_name="Tom")
    resp = client.post(
        children_url(family, wired),
        {
            "child": str(child.id),
            "windows": [{"weekday": 0, "start_time": "16:30", "end_time": "18:00"}],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["first_name"] == "Tom"
    assert len(resp.data["windows"]) == 1


def test_a_child_with_no_windows_is_accepted_and_means_all_day(client, owner, family, wired):
    client.force_authenticate(user=owner)
    child = Child.objects.create(family=family, first_name="Léa")
    resp = client.post(children_url(family, wired), {"child": str(child.id)}, format="json")
    assert resp.status_code == 201
    assert resp.data["windows"] == []


def test_a_child_of_a_family_off_the_contract_is_refused(client, owner, wired, other_family):
    """Their hours would route to a family that never employed the nanny, and
    their name would surface in that family's declaration."""
    client.force_authenticate(user=owner)
    stranger = Child.objects.create(family=other_family, first_name="Hugo")
    resp = client.post(
        children_url(wired.shares.first().family, wired), {"child": str(stranger.id)}
    )
    assert resp.status_code == 400
    assert "child" in resp.data


def test_windows_are_replaced_wholesale_on_update(client, owner, family, wired):
    client.force_authenticate(user=owner)
    child = Child.objects.create(family=family, first_name="Tom")
    link = ContractChild.objects.create(contract=wired, child=child)
    url = reverse("tracking:contract-child", args=[family.id, wired.id, link.id])
    resp = client.patch(
        url,
        {"windows": [{"weekday": 2, "start_time": "08:00", "end_time": "12:00"}]},
        format="json",
    )
    assert resp.status_code == 200
    assert [w["weekday"] for w in resp.data["windows"]] == [2]


# --- exceptional hours: read all, write your own ------------------------------


def test_an_entry_is_pinned_to_the_acting_family(client, owner, family, wired):
    client.force_authenticate(user=owner)
    resp = post_hours(client, family, wired)
    assert resp.status_code == 201, resp.data
    assert resp.data["family"] == family.id


def test_the_family_cannot_be_chosen_from_the_payload(client, owner, family, shared, other_family):
    """Otherwise a family files hours on its co-employer's account."""
    client.force_authenticate(user=owner)
    resp = client.post(
        hours_url(family, shared),
        {
            # Ignored: the viewset pins the family to whoever is acting.
            "family": str(other_family.id),
            "kind": ExceptionalHours.Kind.EFFECTIVE,
            "start_date": "2026-07-14",
            "start_time": "18:30",
            "end_date": "2026-07-14",
            "end_time": "20:00",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["family"] == family.id


def test_a_family_does_not_read_the_other_familys_entries(
    client, owner, family, shared, other_family
):
    """An evening B kept the nanny late is B's business with her, not A's."""
    ExceptionalHours.objects.create(
        contract=shared,
        family=other_family,
        start_date=date(2026, 7, 14),
        start_time=time(18, 30),
        end_date=date(2026, 7, 14),
        end_time=time(20, 0),
    )
    client.force_authenticate(user=owner)
    resp = client.get(hours_url(family, shared))
    assert resp.status_code == 200
    assert resp.data == []


def test_a_family_reads_only_its_own_entries(client, owner, family, shared, other_family):
    """The list is filtered, not emptied: A's own entries are still A's to see."""
    ExceptionalHours.objects.create(
        contract=shared,
        family=other_family,
        start_date=date(2026, 7, 14),
        start_time=time(18, 30),
        end_date=date(2026, 7, 14),
        end_time=time(20, 0),
    )
    client.force_authenticate(user=owner)
    post_hours(client, family, shared, start_date="2026-07-15", end_date="2026-07-15")
    resp = client.get(hours_url(family, shared))
    assert [r["family"] for r in resp.data] == [family.id]


def test_the_other_familys_entry_is_a_404_not_a_403(client, owner, family, shared, other_family):
    """404, deliberately. A 403 saying "this belongs to another family" answers
    the question A is not allowed to ask."""
    theirs = ExceptionalHours.objects.create(
        contract=shared,
        family=other_family,
        start_date=date(2026, 7, 14),
        start_time=time(18, 30),
        end_date=date(2026, 7, 14),
        end_time=time(20, 0),
    )
    client.force_authenticate(user=owner)
    assert client.get(hour_url(family, shared, theirs.id)).status_code == 404


def test_a_family_cannot_edit_the_other_familys_entry(client, owner, family, shared, other_family):
    """The one LeaveViewSet would get wrong: it checks the contract and stops."""
    theirs = ExceptionalHours.objects.create(
        contract=shared,
        family=other_family,
        start_date=date(2026, 7, 14),
        start_time=time(18, 30),
        end_date=date(2026, 7, 14),
        end_time=time(20, 0),
    )
    client.force_authenticate(user=owner)
    resp = client.patch(hour_url(family, shared, theirs.id), {"end_time": "23:00"})
    assert resp.status_code == 404
    theirs.refresh_from_db()
    assert theirs.end_time == time(20, 0)


def test_a_family_cannot_delete_the_other_familys_entry(
    client, owner, family, shared, other_family
):
    theirs = ExceptionalHours.objects.create(
        contract=shared,
        family=other_family,
        start_date=date(2026, 7, 14),
        start_time=time(18, 30),
        end_date=date(2026, 7, 14),
        end_time=time(20, 0),
    )
    client.force_authenticate(user=owner)
    assert client.delete(hour_url(family, shared, theirs.id)).status_code == 404
    assert ExceptionalHours.objects.filter(pk=theirs.pk).exists()


def test_a_family_can_edit_its_own_entry(client, owner, family, shared):
    client.force_authenticate(user=owner)
    mine = post_hours(client, family, shared).data
    resp = client.patch(hour_url(family, shared, mine["id"]), {"end_time": "21:00"})
    assert resp.status_code == 200
    assert resp.data["end_time"] == "21:00:00"


def test_hours_overlapping_the_planning_are_refused(client, owner, family, wired):
    """They are already paid through the mensualisation; counting them again pays
    them twice. A child there outside their window is an ExceptionalPresence."""
    client.force_authenticate(user=owner)
    resp = post_hours(client, family, wired, start_time="16:00", end_time="18:00")
    assert resp.status_code == 400


def test_presence_responsable_is_refused_on_a_shared_contract(client, owner, family, shared):
    """CCN 3239 art. 137.1 excludes it from a garde partagée."""
    client.force_authenticate(user=owner)
    resp = post_hours(client, family, shared, kind=ExceptionalHours.Kind.PRESENCE_RESPONSABLE)
    assert resp.status_code == 400
    assert "kind" in resp.data


def test_presence_responsable_is_allowed_on_a_solo_contract(client, owner, family, wired):
    client.force_authenticate(user=owner)
    resp = post_hours(client, family, wired, kind=ExceptionalHours.Kind.PRESENCE_RESPONSABLE)
    assert resp.status_code == 201


def test_a_daytime_night_is_refused(client, owner, family, wired):
    client.force_authenticate(user=owner)
    resp = post_hours(
        client,
        family,
        wired,
        kind=ExceptionalHours.Kind.NIGHT_PRESENCE,
        start_time="14:00",
        end_time="16:00",
    )
    assert resp.status_code == 400


def test_member_can_read_exceptional_hours(client, member, family, wired):
    client.force_authenticate(user=member)
    assert client.get(hours_url(family, wired)).status_code == 200


def test_writing_exceptional_hours_requires_owner(client, member, family, wired):
    client.force_authenticate(user=member)
    assert post_hours(client, family, wired).status_code == 403


def test_reading_exceptional_hours_requires_family_access(client, outsider, family, wired):
    client.force_authenticate(user=outsider)
    assert client.get(hours_url(family, wired)).status_code == 403


# --- declarations -------------------------------------------------------------


def test_listing_computes_a_draft_per_family_and_returns_only_yours(
    client, owner, family, shared, other_family
):
    """Both rows are rebuilt — the split is one calculation over the nanny's whole
    month, so B's would go stale if only A's were — but only A's comes back."""
    client.force_authenticate(user=owner)
    resp = client.get(declarations_url(family, shared), {"month": "2026-07"})
    assert resp.status_code == 200
    assert [r["family"] for r in resp.data] == [family.id]
    assert resp.data[0]["status"] == "draft"
    assert Decimal(resp.data[0]["normal_hours"]) > 0

    # B's draft exists all the same; it just never left the server.
    assert MonthlyDeclaration.objects.filter(
        contract=shared, family=other_family, month=date(2026, 7, 1)
    ).exists()


def test_a_bad_month_is_a_400_not_a_500(client, owner, family, wired):
    client.force_authenticate(user=owner)
    assert client.get(declarations_url(family, wired), {"month": "juillet"}).status_code == 400


def test_listing_without_a_month_uses_the_current_one(client, owner, family, wired):
    client.force_authenticate(user=owner)
    resp = client.get(declarations_url(family, wired))
    assert resp.status_code == 200
    assert len(resp.data) == 1


def test_a_warning_carries_the_rule_behind_it(client, owner, family, wired):
    """A bare code makes a parent take our word for a number they are about to
    file; the quote and the URL are what let them check it."""
    ContractTerms.objects.create(
        contract=wired, effective_from=date(2026, 7, 16), net_hourly_rate=Decimal("13.00")
    )
    client.force_authenticate(user=owner)
    resp = client.get(declarations_url(family, wired), {"month": "2026-07"})
    warnings = {w["code"]: w for w in resp.data[0]["warnings"]}
    assert "rates_changed_mid_month" in warnings
    source = warnings["rates_changed_mid_month"]["source"]
    assert source["url"].startswith("https://")
    assert "52 semaines" in source["quote"]


def test_kilometres_can_be_typed_and_repriced(client, owner, family, wired):
    ContractTerms.objects.create(
        contract=wired,
        effective_from=date(2026, 2, 1),
        net_hourly_rate=Decimal("12.00"),
        mileage_rate=Decimal("0.350"),
    )
    client.force_authenticate(user=owner)
    row = client.get(declarations_url(family, wired), {"month": "2026-07"}).data[0]
    url = reverse("tracking:contract-declaration", args=[family.id, wired.id, row["id"]])
    resp = client.patch(url, {"kilometers": "120"}, format="json")
    assert resp.status_code == 200
    assert Decimal(resp.data["mileage_amount"]) == Decimal("42.00")


def test_the_computed_numbers_cannot_be_typed(client, owner, family, wired):
    client.force_authenticate(user=owner)
    row = client.get(declarations_url(family, wired), {"month": "2026-07"}).data[0]
    url = reverse("tracking:contract-declaration", args=[family.id, wired.id, row["id"]])
    resp = client.patch(url, {"normal_hours": "999", "total_amount": "99999"}, format="json")
    assert resp.status_code == 200
    assert Decimal(resp.data["normal_hours"]) != Decimal("999")


def test_filing_records_the_declaration(client, owner, family, wired):
    client.force_authenticate(user=owner)
    row = client.get(declarations_url(family, wired), {"month": "2026-07"}).data[0]
    resp = client.post(file_url(family, wired, row["id"]))
    assert resp.status_code == 200
    assert resp.data["status"] == "filed"
    assert resp.data["filed_at"] is not None


def test_a_recent_filed_declaration_stays_editable_in_place(client, owner, family, wired):
    """The grace window: a mistake is usually caught a payslip or two later, so a
    just-filed month can still be corrected — kilometres and all — until it locks."""
    client.force_authenticate(user=owner)
    this_month = timezone.localdate().strftime("%Y-%m")
    row = client.get(declarations_url(family, wired), {"month": this_month}).data[0]
    filed = client.post(file_url(family, wired, row["id"]))
    assert filed.data["status"] == "filed"
    assert filed.data["is_editable"] is True

    url = reverse("tracking:contract-declaration", args=[family.id, wired.id, row["id"]])
    resp = client.patch(url, {"kilometers": "120"}, format="json")
    assert resp.status_code == 200
    # Still filed, but the edit took: this is "editable in place", not a reopen.
    assert resp.data["status"] == "filed"
    assert Decimal(resp.data["kilometers"]) == Decimal("120")


def test_a_filed_declaration_freezes_once_its_grace_window_ends(client, owner, family, wired):
    """Past the window a filed row is the record of what was sent, and locks — the
    edit is refused and the stored figures never move again."""
    old_month = first_of_month(timezone.localdate(), -(MonthlyDeclaration.EDIT_GRACE_MONTHS + 1))
    row = MonthlyDeclaration.objects.create(
        contract=wired,
        family=family,
        month=old_month,
        status=MonthlyDeclaration.Status.FILED,
        filed_at=timezone.now(),
        kilometers=Decimal("0"),
    )
    assert row.is_frozen
    client.force_authenticate(user=owner)
    url = reverse("tracking:contract-declaration", args=[family.id, wired.id, row.id])
    assert client.patch(url, {"kilometers": "500"}, format="json").status_code == 400
    row.refresh_from_db()
    assert row.kilometers == Decimal("0")


def test_a_family_cannot_file_the_other_familys_declaration(
    client, owner, family, shared, other_family
):
    """Reached by id straight from the database, since the API would never name it."""
    client.force_authenticate(user=owner)
    client.get(declarations_url(family, shared), {"month": "2026-07"})
    theirs = MonthlyDeclaration.objects.get(
        contract=shared, family=other_family, month=date(2026, 7, 1)
    )
    assert client.post(file_url(family, shared, theirs.id)).status_code == 404
    theirs.refresh_from_db()
    assert theirs.status == "draft"


def test_a_family_does_not_read_the_other_familys_declaration(
    client, owner, family, shared, other_family
):
    """What B pays the nanny is between B and the nanny."""
    client.force_authenticate(user=owner)
    rows = client.get(declarations_url(family, shared), {"month": "2026-07"}).data
    assert {r["family"] for r in rows} == {family.id}

    theirs = MonthlyDeclaration.objects.get(
        contract=shared, family=other_family, month=date(2026, 7, 1)
    )
    detail = reverse("tracking:contract-declaration", args=[family.id, shared.id, theirs.id])
    assert client.get(detail).status_code == 404


def test_member_can_read_declarations(client, member, family, wired):
    client.force_authenticate(user=member)
    assert client.get(declarations_url(family, wired), {"month": "2026-07"}).status_code == 200


def test_reading_declarations_requires_family_access(client, outsider, family, wired):
    client.force_authenticate(user=outsider)
    assert client.get(declarations_url(family, wired), {"month": "2026-07"}).status_code == 403


def test_the_shared_month_covers_the_nannys_month(client, owner, family, shared, other_family):
    """The invariant: what the families declare between them is at least what the
    nanny actually worked — the declared hours round UP, per family, so together
    they cover her month and never fall short of it.

    Asserted against the database, because no single caller of the API can see
    both halves any more — which is the point. The split still has to add up; a
    family simply has to take that on trust now, and this is what makes the trust
    good.
    """
    for fam in (family, other_family):
        child = Child.objects.create(family=fam, first_name="Kid")
        ContractChild.objects.create(contract=shared, child=child)
    client.force_authenticate(user=owner)
    # One GET rebuilds both drafts.
    client.get(declarations_url(family, shared), {"month": "2026-07"})

    rows = MonthlyDeclaration.objects.filter(contract=shared, month=date(2026, 7, 1))
    assert {r.family_id for r in rows} == {family.id, other_family.id}
    declared = sum(r.normal_hours + r.hours_25 + r.hours_50 for r in rows)
    # 40h x 52 / 12 = 173.33h worked; each family rounds its 86.67h up to 87.
    assert declared >= Decimal("173.33")
    assert declared == Decimal("174")
