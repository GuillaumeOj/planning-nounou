from decimal import Decimal

import pytest
from django.urls import reverse

from tracking.models import ContractTerms, MinimumWage

pytestmark = pytest.mark.django_db


def terms_url(family, contract):
    return reverse("tracking:contract-terms", args=[family.id, contract.id])


def post_terms(client, family, contract, **fields):
    fields.setdefault("net_hourly_rate", "12.50")
    return client.post(terms_url(family, contract), fields, format="json")


def test_create_terms_serializes_decimals_as_strings(client, owner, family, contract):
    client.force_authenticate(user=owner)

    resp = post_terms(
        client,
        family,
        contract,
        effective_from="2026-06-01",
        net_hourly_rate="12.50",
        transport_fee="40.00",
        mileage_rate="0.529",
    )

    assert resp.status_code == 201
    assert resp.data["net_hourly_rate"] == "12.50"
    assert resp.data["mileage_rate"] == "0.529"
    assert resp.data["transport_fee"] == "40.00"


def test_history_is_preserved_on_edit(client, owner, family, contract):
    client.force_authenticate(user=owner)
    post_terms(client, family, contract, effective_from="2026-01-01", net_hourly_rate="11.00")
    post_terms(client, family, contract, effective_from="2026-05-01", net_hourly_rate="12.00")

    resp = client.get(terms_url(family, contract))

    assert resp.status_code == 200
    assert [t["effective_from"] for t in resp.data] == ["2026-05-01", "2026-01-01"]
    # The earlier snapshot is untouched.
    old = next(t for t in resp.data if t["effective_from"] == "2026-01-01")
    assert old["net_hourly_rate"] == "11.00"
    assert ContractTerms.objects.filter(contract=contract).count() == 2


def test_same_day_edit_updates_in_place(client, owner, family, contract):
    client.force_authenticate(user=owner)
    post_terms(client, family, contract, effective_from="2026-06-01", net_hourly_rate="11.00")
    resp = post_terms(
        client, family, contract, effective_from="2026-06-01", net_hourly_rate="13.00"
    )

    assert resp.status_code == 201
    assert ContractTerms.objects.filter(contract=contract).count() == 1
    assert resp.data["net_hourly_rate"] == "13.00"


def test_below_minimum_returns_soft_warning(client, owner, family, contract):
    client.force_authenticate(user=owner)

    resp = post_terms(client, family, contract, effective_from="2026-06-01", net_hourly_rate="9.00")

    assert resp.status_code == 201  # saved despite being below the minimum
    assert resp.data["below_minimum"] is True
    assert resp.data["warnings"]
    assert resp.data["minimum_net_hourly_rate"] == "10.07"


def test_at_or_above_minimum_has_no_warning(client, owner, family, contract):
    client.force_authenticate(user=owner)

    resp = post_terms(
        client, family, contract, effective_from="2026-06-01", net_hourly_rate="15.00"
    )

    assert resp.status_code == 201
    assert resp.data["below_minimum"] is False
    assert resp.data["warnings"] == []


def test_minimum_is_looked_up_by_effective_date(client, owner, family, contract):
    # A higher minimum applies from 2027; the same rate is below it then, above before.
    MinimumWage.objects.create(effective_from="2027-01-01", net_hourly_rate=Decimal("12.00"))
    client.force_authenticate(user=owner)

    before = post_terms(
        client, family, contract, effective_from="2026-06-01", net_hourly_rate="11.00"
    )
    after = post_terms(
        client, family, contract, effective_from="2027-06-01", net_hourly_rate="11.00"
    )

    assert before.data["below_minimum"] is False
    assert after.data["below_minimum"] is True


def test_negative_rate_rejected(client, owner, family, contract):
    client.force_authenticate(user=owner)
    resp = post_terms(client, family, contract, net_hourly_rate="-1.00")
    assert resp.status_code == 400
    assert "net_hourly_rate" in resp.data


def test_effective_to_is_derived(client, owner, family, contract):
    client.force_authenticate(user=owner)
    post_terms(client, family, contract, effective_from="2026-01-01", net_hourly_rate="11.00")
    post_terms(client, family, contract, effective_from="2026-05-01", net_hourly_rate="12.00")

    resp = client.get(terms_url(family, contract))

    by_date = {t["effective_from"]: t for t in resp.data}
    assert by_date["2026-01-01"]["effective_to"] == "2026-04-30"
    assert by_date["2026-05-01"]["effective_to"] is None


def test_write_requires_owner(client, member, family, contract):
    client.force_authenticate(user=member)
    resp = post_terms(client, family, contract, net_hourly_rate="12.00")
    assert resp.status_code == 403


def test_read_requires_family_access(client, outsider, family, contract):
    client.force_authenticate(user=outsider)
    assert client.get(terms_url(family, contract)).status_code == 403


def term_url(family, contract, term_id):
    from django.urls import reverse as _reverse

    return _reverse("tracking:contract-term", args=[family.id, contract.id, term_id])


def test_fresh_terms_are_not_marked_edited(client, owner, family, contract):
    client.force_authenticate(user=owner)
    resp = post_terms(client, family, contract, net_hourly_rate="12.00")
    assert resp.data["edited"] is False


def test_edit_terms_in_place_marks_edited(client, owner, family, contract):
    client.force_authenticate(user=owner)
    created = post_terms(
        client, family, contract, effective_from="2026-06-01", net_hourly_rate="11.00"
    )
    resp = client.patch(
        term_url(family, contract, created.data["id"]),
        {"net_hourly_rate": "13.00"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["net_hourly_rate"] == "13.00"
    assert resp.data["edited"] is True
    assert ContractTerms.objects.filter(contract=contract).count() == 1


def test_same_day_repost_marks_edited(client, owner, family, contract):
    client.force_authenticate(user=owner)
    post_terms(client, family, contract, effective_from="2026-06-01", net_hourly_rate="11.00")
    resp = post_terms(
        client, family, contract, effective_from="2026-06-01", net_hourly_rate="12.00"
    )
    assert resp.data["edited"] is True


def test_delete_terms_snapshot(client, owner, family, contract):
    client.force_authenticate(user=owner)
    created = post_terms(client, family, contract, net_hourly_rate="12.00")
    resp = client.delete(term_url(family, contract, created.data["id"]))
    assert resp.status_code == 204
    assert ContractTerms.objects.filter(contract=contract).count() == 0


def test_edit_requires_owner(client, owner, member, family, contract):
    client.force_authenticate(user=owner)
    created = post_terms(client, family, contract, net_hourly_rate="12.00")
    client.force_authenticate(user=member)
    resp = client.patch(
        term_url(family, contract, created.data["id"]),
        {"net_hourly_rate": "13.00"},
        format="json",
    )
    assert resp.status_code == 403


def test_night_presence_rate_roundtrips(client, owner, family, contract):
    client.force_authenticate(user=owner)
    resp = post_terms(client, family, contract, net_hourly_rate="12.00", night_presence_rate="3.50")
    assert resp.status_code == 201
    assert resp.data["night_presence_rate"] == "3.50"


def test_history_records_who_made_the_change(client, owner, family, contract):
    # owner has no name set, so the display name falls back to the email.
    client.force_authenticate(user=owner)
    created = post_terms(client, family, contract, net_hourly_rate="12.00")
    assert created.data["created_by_name"] == owner.email

    resp = client.get(terms_url(family, contract))
    assert resp.data[0]["created_by_name"] == owner.email
