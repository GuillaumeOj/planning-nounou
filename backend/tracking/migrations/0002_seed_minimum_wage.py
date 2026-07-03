"""Seed the recommended net-hourly minimum with a starting date.

The URSSAF figure is re-indexed over time; this seeds the first row so the API
has a minimum to warn against out of the box. Admins add later rows as it
changes (each with its own ``effective_from``), keeping the history.
"""

from datetime import date
from decimal import Decimal

from django.db import migrations

INITIAL_EFFECTIVE_FROM = date(2025, 1, 1)
INITIAL_RATE = Decimal("10.07")


def seed_minimum_wage(apps, schema_editor):
    MinimumWage = apps.get_model("tracking", "MinimumWage")
    MinimumWage.objects.get_or_create(
        effective_from=INITIAL_EFFECTIVE_FROM,
        defaults={"net_hourly_rate": INITIAL_RATE},
    )


def unseed_minimum_wage(apps, schema_editor):
    MinimumWage = apps.get_model("tracking", "MinimumWage")
    MinimumWage.objects.filter(effective_from=INITIAL_EFFECTIVE_FROM).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("tracking", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_minimum_wage, unseed_minimum_wage),
    ]
