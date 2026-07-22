import pytest
from django.urls import reverse

pytestmark = pytest.mark.django_db

URL = reverse("reference:paid-leave-default")


def test_returns_default_for_a_given_date(client, owner):
    client.force_authenticate(user=owner)
    # 30 days is seeded from 2025-01-01 by migration 0004.
    resp = client.get(URL, {"on": "2026-06-01"})
    assert resp.status_code == 200
    assert resp.data["annual_days"] == 30


def test_returns_null_before_the_first_default(client, owner):
    client.force_authenticate(user=owner)
    resp = client.get(URL, {"on": "2024-01-01"})
    assert resp.status_code == 200
    assert resp.data["annual_days"] is None


def test_defaults_to_today_when_no_date(client, owner):
    client.force_authenticate(user=owner)
    resp = client.get(URL)
    assert resp.status_code == 200
    assert resp.data["annual_days"] == 30


def test_requires_authentication(client):
    assert client.get(URL).status_code == 401
