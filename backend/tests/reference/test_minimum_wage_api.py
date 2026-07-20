import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db

URL = reverse("reference:minimum-wage")


def test_returns_minimum_for_a_given_date(client, owner):
    client.force_authenticate(user=owner)
    # 10.07 is seeded from 2025-01-01 by migration 0003.
    resp = client.get(URL, {"on": "2026-06-01"})
    assert resp.status_code == 200
    assert resp.data["net_hourly_rate"] == "10.07"


def test_returns_null_before_the_first_minimum(client, owner):
    client.force_authenticate(user=owner)
    resp = client.get(URL, {"on": "2024-01-01"})
    assert resp.status_code == 200
    assert resp.data["net_hourly_rate"] is None


def test_defaults_to_today_when_no_date(client, owner):
    client.force_authenticate(user=owner)
    resp = client.get(URL)
    assert resp.status_code == 200
    assert resp.data["net_hourly_rate"] == "10.07"


def test_requires_authentication(client):
    assert client.get(URL).status_code == 401
