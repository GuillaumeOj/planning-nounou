import datetime

import pytest
from django.core.management import call_command

from tracking.models import BankHoliday

pytestmark = pytest.mark.django_db


def test_seeds_eleven_holidays():
    call_command("seed_bank_holidays", "2026")
    assert BankHoliday.objects.filter(date__year=2026).count() == 11


def test_computes_easter_based_dates_for_2026():
    # Easter Sunday 2026 is 5 April → the movable feasts follow from it.
    call_command("seed_bank_holidays", "2026")
    by_name = {h.name: h.date for h in BankHoliday.objects.all()}
    assert by_name["Lundi de Pâques"] == datetime.date(2026, 4, 6)
    assert by_name["Ascension"] == datetime.date(2026, 5, 14)
    assert by_name["Lundi de Pentecôte"] == datetime.date(2026, 5, 25)


def test_holidays_are_non_workable_by_default():
    call_command("seed_bank_holidays", "2026")
    assert not BankHoliday.objects.filter(is_workable=True).exists()


def test_is_idempotent_and_keeps_admin_edits():
    call_command("seed_bank_holidays", "2026")
    # An admin flips one holiday to workable; a re-run must not revert it.
    holiday = BankHoliday.objects.get(name="Lundi de Pentecôte")
    holiday.is_workable = True
    holiday.save()

    call_command("seed_bank_holidays", "2026")

    assert BankHoliday.objects.filter(date__year=2026).count() == 11
    holiday.refresh_from_db()
    assert holiday.is_workable is True
