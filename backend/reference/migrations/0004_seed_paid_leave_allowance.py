"""Seed the default annual paid-leave days a new contract pre-fills from.

The branch's statutory entitlement is 30 jours ouvrables (garde d'enfants à
domicile, CCN 3239); this seeds the first row so the contract form has a default
out of the box. Admins add later rows (each with its own ``effective_from``) if it
changes, keeping the history.
"""

from datetime import date

from django.db import migrations

INITIAL_EFFECTIVE_FROM = date(2025, 1, 1)
INITIAL_ANNUAL_DAYS = 30


def seed_paid_leave_allowance(apps, schema_editor):
    PaidLeaveAllowance = apps.get_model("reference", "PaidLeaveAllowance")
    PaidLeaveAllowance.objects.get_or_create(
        effective_from=INITIAL_EFFECTIVE_FROM,
        defaults={"annual_days": INITIAL_ANNUAL_DAYS},
    )


def unseed_paid_leave_allowance(apps, schema_editor):
    PaidLeaveAllowance = apps.get_model("reference", "PaidLeaveAllowance")
    PaidLeaveAllowance.objects.filter(effective_from=INITIAL_EFFECTIVE_FROM).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("reference", "0003_paidleaveallowance"),
    ]

    operations = [
        migrations.RunPython(seed_paid_leave_allowance, unseed_paid_leave_allowance),
    ]
