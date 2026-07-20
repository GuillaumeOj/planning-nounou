"""Seed the French national bank holidays (jours fériés) for a given year.

Idempotent: existing holidays (matched on ``date``) are left untouched, so admin
edits — e.g. flipping the journée de solidarité to workable — survive a re-run.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, cast

from django.core.management.base import BaseCommand, CommandError

from reference.holidays import french_bank_holidays
from reference.models import BankHoliday

if TYPE_CHECKING:
    from argparse import ArgumentParser


class Command(BaseCommand):
    help = "Seed the French national bank holidays (jours fériés) for a given year."

    def add_arguments(self, parser: ArgumentParser) -> None:
        parser.add_argument("year", type=int, help="Calendar year, e.g. 2026")

    def handle(self, *args: object, **options: object) -> None:
        year = cast(int, options["year"])
        if year < 1583:
            # The Gregorian computus is only defined from the calendar's adoption.
            raise CommandError("Give a Gregorian year (>= 1583), e.g. 2026.")

        holidays = french_bank_holidays(year)
        created = 0
        for name, day in holidays:
            _, was_created = BankHoliday.objects.get_or_create(
                date=day, defaults={"name": name, "is_workable": False}
            )
            if was_created:
                created += 1

        existing = len(holidays) - created
        self.stdout.write(
            self.style.SUCCESS(f"{year}: {created} holiday(s) created, {existing} already present.")
        )
