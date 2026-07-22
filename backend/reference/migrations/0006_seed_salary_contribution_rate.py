"""Seed the employee-side social-contribution rate (cotisations salariales).

The app prices in net, but the congés-payés « rappel de 1/10 » is a brut
comparison (art. L3141-24), so it needs the rate that crosses net⇄brut. This
seeds the current URSSAF figure for garde d'enfants à domicile so the
reconciliation works out of the box. Admins add later rows (each with its own
``effective_from``) as URSSAF re-indexes it, keeping the history.
"""

from datetime import date
from decimal import Decimal

from django.db import migrations

INITIAL_EFFECTIVE_FROM = date(2025, 1, 1)
INITIAL_RATE = Decimal("0.2188025")


def seed_salary_contribution_rate(apps, schema_editor):
    SalaryContributionRate = apps.get_model("reference", "SalaryContributionRate")
    SalaryContributionRate.objects.get_or_create(
        effective_from=INITIAL_EFFECTIVE_FROM,
        defaults={"rate": INITIAL_RATE},
    )


def unseed_salary_contribution_rate(apps, schema_editor):
    SalaryContributionRate = apps.get_model("reference", "SalaryContributionRate")
    SalaryContributionRate.objects.filter(effective_from=INITIAL_EFFECTIVE_FROM).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("reference", "0005_salarycontributionrate"),
    ]

    operations = [
        migrations.RunPython(seed_salary_contribution_rate, unseed_salary_contribution_rate),
    ]
