import pytest
from django.urls import reverse

from tracking.models import Leave

pytestmark = pytest.mark.django_db


def leaves_url(family, contract):
    return reverse("tracking:contract-leaves", args=[family.id, contract.id])


def leave_url(family, contract, leave_id):
    return reverse("tracking:contract-leave", args=[family.id, contract.id, leave_id])


def post_leave(client, family, contract, **fields):
    fields.setdefault("leave_type", "paid")
    fields.setdefault("start_date", "2026-07-06")
    fields.setdefault("end_date", "2026-07-10")
    fields.setdefault("portion", "full_day")
    return client.post(leaves_url(family, contract), fields, format="json")


def test_create_leave(client, owner, family, contract):
    client.force_authenticate(user=owner)

    resp = post_leave(client, family, contract, leave_type="sickness", portion="half_day")

    assert resp.status_code == 201
    assert resp.data["leave_type"] == "sickness"
    assert resp.data["portion"] == "half_day"
    assert resp.data["hours"] is None
    assert Leave.objects.filter(contract=contract).count() == 1


def test_create_records_creator(client, owner, family, contract):
    client.force_authenticate(user=owner)
    post_leave(client, family, contract)
    assert Leave.objects.get(contract=contract).created_by == owner


def test_list_leaves(client, owner, family, contract):
    client.force_authenticate(user=owner)
    post_leave(client, family, contract, start_date="2026-07-01", end_date="2026-07-02")
    post_leave(client, family, contract, start_date="2026-08-01", end_date="2026-08-02")

    resp = client.get(leaves_url(family, contract))

    assert resp.status_code == 200
    # Ordered by -start_date.
    assert [leave["start_date"] for leave in resp.data] == ["2026-08-01", "2026-07-01"]


def test_update_leave(client, owner, family, contract):
    client.force_authenticate(user=owner)
    created = post_leave(client, family, contract)

    resp = client.patch(
        leave_url(family, contract, created.data["id"]),
        {"end_date": "2026-07-15"},
        format="json",
    )

    assert resp.status_code == 200
    assert resp.data["end_date"] == "2026-07-15"


def test_delete_leave(client, owner, family, contract):
    client.force_authenticate(user=owner)
    created = post_leave(client, family, contract)

    resp = client.delete(leave_url(family, contract, created.data["id"]))

    assert resp.status_code == 204
    assert Leave.objects.filter(contract=contract).count() == 0


def test_hourly_unpaid_leave(client, owner, family, contract):
    client.force_authenticate(user=owner)

    resp = post_leave(client, family, contract, leave_type="unpaid", portion="hourly", hours="3.50")

    assert resp.status_code == 201
    assert resp.data["hours"] == "3.50"


def test_end_before_start_rejected(client, owner, family, contract):
    client.force_authenticate(user=owner)
    resp = post_leave(client, family, contract, start_date="2026-07-10", end_date="2026-07-01")
    assert resp.status_code == 400
    assert "end_date" in resp.data


def test_hourly_on_non_unpaid_rejected(client, owner, family, contract):
    client.force_authenticate(user=owner)
    resp = post_leave(client, family, contract, leave_type="paid", portion="hourly", hours="2.00")
    assert resp.status_code == 400
    assert "portion" in resp.data


def test_hourly_requires_hours(client, owner, family, contract):
    client.force_authenticate(user=owner)
    resp = post_leave(client, family, contract, leave_type="unpaid", portion="hourly")
    assert resp.status_code == 400
    assert "hours" in resp.data


def test_hours_forbidden_on_non_hourly(client, owner, family, contract):
    client.force_authenticate(user=owner)
    resp = post_leave(client, family, contract, portion="full_day", hours="2.00")
    assert resp.status_code == 400
    assert "hours" in resp.data


def test_member_can_read(client, member, family, contract):
    client.force_authenticate(user=member)
    assert client.get(leaves_url(family, contract)).status_code == 200


def test_write_requires_owner(client, member, family, contract):
    client.force_authenticate(user=member)
    resp = post_leave(client, family, contract)
    assert resp.status_code == 403


def test_read_requires_family_access(client, outsider, family, contract):
    client.force_authenticate(user=outsider)
    assert client.get(leaves_url(family, contract)).status_code == 403
