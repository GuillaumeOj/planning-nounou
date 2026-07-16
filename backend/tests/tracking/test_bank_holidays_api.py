import datetime

import pytest
from django.urls import reverse

from tracking.models import BankHoliday

pytestmark = pytest.mark.django_db

URL = reverse("tracking:bank-holidays")


def test_lists_holidays_ordered_by_date(client, owner):
    client.force_authenticate(user=owner)
    BankHoliday.objects.create(name="Noël", date=datetime.date(2026, 12, 25))
    BankHoliday.objects.create(name="Jour de l'An", date=datetime.date(2026, 1, 1))

    resp = client.get(URL)

    assert resp.status_code == 200
    assert [h["date"] for h in resp.data] == ["2026-01-01", "2026-12-25"]
    assert resp.data[0]["name"] == "Jour de l'An"
    assert resp.data[0]["is_workable"] is False


def test_filters_by_year(client, owner):
    client.force_authenticate(user=owner)
    BankHoliday.objects.create(name="Noël 2025", date=datetime.date(2025, 12, 25))
    BankHoliday.objects.create(name="Noël 2026", date=datetime.date(2026, 12, 25))

    resp = client.get(URL, {"year": "2026"})

    assert resp.status_code == 200
    assert [h["date"] for h in resp.data] == ["2026-12-25"]


def test_ignores_non_numeric_year(client, owner):
    client.force_authenticate(user=owner)
    BankHoliday.objects.create(name="Noël", date=datetime.date(2026, 12, 25))

    resp = client.get(URL, {"year": "abc"})

    assert resp.status_code == 200
    assert len(resp.data) == 1


def test_requires_authentication(client):
    assert client.get(URL).status_code == 401
