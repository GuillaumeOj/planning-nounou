import pytest
from django.urls import reverse

from tracking.models import ContractSchedule

pytestmark = pytest.mark.django_db


def schedule_url(family, contract):
    return reverse("tracking:contract-schedule", args=[family.id, contract.id])


MON = 0
TUE = 1


def block(weekday, start, end):
    return {"weekday": weekday, "start_time": start, "end_time": end}


def test_create_schedule_with_blocks(client, owner, family, contract):
    client.force_authenticate(user=owner)

    resp = client.post(
        schedule_url(family, contract),
        {
            "effective_from": "2026-06-01",
            "blocks": [
                block(MON, "08:00", "12:00"),
                block(MON, "14:00", "18:00"),
            ],
        },
        format="json",
    )

    assert resp.status_code == 201
    assert len(resp.data["blocks"]) == 2
    assert resp.data["weekly_hours"] == 8.0


def test_block_end_before_start_rejected(client, owner, family, contract):
    client.force_authenticate(user=owner)
    resp = client.post(
        schedule_url(family, contract),
        {"blocks": [block(MON, "18:00", "08:00")]},
        format="json",
    )
    assert resp.status_code == 400


def test_overlapping_blocks_same_day_rejected(client, owner, family, contract):
    client.force_authenticate(user=owner)
    resp = client.post(
        schedule_url(family, contract),
        {"blocks": [block(MON, "08:00", "12:00"), block(MON, "11:00", "13:00")]},
        format="json",
    )
    assert resp.status_code == 400


def test_adjacent_blocks_same_day_allowed(client, owner, family, contract):
    client.force_authenticate(user=owner)
    resp = client.post(
        schedule_url(family, contract),
        {"blocks": [block(MON, "08:00", "12:00"), block(MON, "12:00", "18:00")]},
        format="json",
    )
    assert resp.status_code == 201


def test_history_is_preserved(client, owner, family, contract):
    client.force_authenticate(user=owner)
    client.post(
        schedule_url(family, contract),
        {"effective_from": "2026-01-01", "blocks": [block(MON, "08:00", "12:00")]},
        format="json",
    )
    client.post(
        schedule_url(family, contract),
        {"effective_from": "2026-05-01", "blocks": [block(TUE, "08:00", "12:00")]},
        format="json",
    )

    resp = client.get(schedule_url(family, contract))

    assert [s["effective_from"] for s in resp.data] == ["2026-05-01", "2026-01-01"]
    assert ContractSchedule.objects.filter(contract=contract).count() == 2


def test_same_day_edit_replaces_snapshot(client, owner, family, contract):
    client.force_authenticate(user=owner)
    client.post(
        schedule_url(family, contract),
        {"effective_from": "2026-06-01", "blocks": [block(MON, "08:00", "12:00")]},
        format="json",
    )
    resp = client.post(
        schedule_url(family, contract),
        {
            "effective_from": "2026-06-01",
            "blocks": [block(MON, "08:00", "12:00"), block(TUE, "08:00", "12:00")],
        },
        format="json",
    )

    assert resp.status_code == 201
    assert ContractSchedule.objects.filter(contract=contract).count() == 1
    assert len(resp.data["blocks"]) == 2


def test_write_requires_owner(client, member, family, contract):
    client.force_authenticate(user=member)
    resp = client.post(
        schedule_url(family, contract),
        {"blocks": [block(MON, "08:00", "12:00")]},
        format="json",
    )
    assert resp.status_code == 403


def schedule_detail_url(family, contract, schedule_id):
    return reverse("tracking:contract-schedule-detail", args=[family.id, contract.id, schedule_id])


def test_fresh_schedule_is_not_marked_edited(client, owner, family, contract):
    client.force_authenticate(user=owner)
    resp = client.post(
        schedule_url(family, contract),
        {"blocks": [block(MON, "08:00", "12:00")]},
        format="json",
    )
    assert resp.data["edited"] is False


def test_edit_schedule_in_place_replaces_blocks_and_marks_edited(client, owner, family, contract):
    client.force_authenticate(user=owner)
    created = client.post(
        schedule_url(family, contract),
        {"effective_from": "2026-06-01", "blocks": [block(MON, "08:00", "12:00")]},
        format="json",
    )
    resp = client.patch(
        schedule_detail_url(family, contract, created.data["id"]),
        {"blocks": [block(MON, "08:00", "12:00"), block(TUE, "09:00", "17:00")]},
        format="json",
    )
    assert resp.status_code == 200
    assert len(resp.data["blocks"]) == 2
    assert resp.data["edited"] is True
    assert ContractSchedule.objects.filter(contract=contract).count() == 1


def test_delete_schedule_snapshot(client, owner, family, contract):
    client.force_authenticate(user=owner)
    created = client.post(
        schedule_url(family, contract),
        {"blocks": [block(MON, "08:00", "12:00")]},
        format="json",
    )
    resp = client.delete(schedule_detail_url(family, contract, created.data["id"]))
    assert resp.status_code == 204
    assert ContractSchedule.objects.filter(contract=contract).count() == 0


def test_schedule_history_records_who_made_the_change(client, owner, family, contract):
    client.force_authenticate(user=owner)
    resp = client.post(
        schedule_url(family, contract),
        {"effective_from": "2026-06-01", "blocks": [block(MON, "08:00", "12:00")]},
        format="json",
    )
    assert resp.status_code == 201
    # owner has no name set, so the display name falls back to the email.
    assert resp.data["created_by_name"] == owner.email
