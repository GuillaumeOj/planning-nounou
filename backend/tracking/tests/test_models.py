import datetime

import pytest

from accounts.models import User
from tracking.models import Nanny

pytestmark = pytest.mark.django_db


def test_nanny_str_is_full_name():
    owner = User.objects.create_user(email="owner@example.com", password="pass-phrase-42")
    nanny = Nanny.objects.create(
        owner=owner,
        first_name="Marie",
        last_name="Dupont",
        starting_date=datetime.date(2026, 1, 5),
    )

    assert str(nanny) == "Marie Dupont"


def test_nannies_ordered_by_starting_date_desc():
    owner = User.objects.create_user(email="owner@example.com", password="pass-phrase-42")
    older = Nanny.objects.create(
        owner=owner, first_name="A", last_name="A", starting_date=datetime.date(2025, 1, 1)
    )
    newer = Nanny.objects.create(
        owner=owner, first_name="B", last_name="B", starting_date=datetime.date(2026, 1, 1)
    )

    assert list(Nanny.objects.all()) == [newer, older]
