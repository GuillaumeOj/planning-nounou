"""Back up each legacy per-user Nanny into a shared Contract before the old
``owner``/``starting_date``/``ending_date`` columns are dropped (0005).

Each nanny becomes a Contract shared with one of the owner's families (an owned
family, else any family they belong to, else a family created for them so no row
is lost). Compensation and schedule are brand-new concepts, so nothing is
backfilled there — legacy contracts simply start with no terms until a parent
enters them. Reversible: restores the columns from the created contracts.
"""

from django.db import migrations


def create_contracts_from_nannies(apps, schema_editor):
    Nanny = apps.get_model("tracking", "Nanny")
    Family = apps.get_model("accounts", "Family")
    FamilyMembership = apps.get_model("accounts", "FamilyMembership")
    Contract = apps.get_model("tracking", "Contract")
    ContractShare = apps.get_model("tracking", "ContractShare")

    for nanny in Nanny.objects.filter(owner__isnull=False):
        owner = nanny.owner
        family = (
            Family.objects.filter(
                memberships__user=owner, memberships__role="owner"
            ).first()
            or Family.objects.filter(memberships__user=owner).first()
        )
        if family is None:
            name = (owner.first_name.strip() or owner.email) + "'s family"
            family = Family.objects.create(name=name, created_by=owner)
            FamilyMembership.objects.create(family=family, user=owner, role="owner")
        contract = Contract.objects.create(
            nanny=nanny,
            created_by=owner,
            starting_date=nanny.starting_date,
            ending_date=nanny.ending_date,
        )
        ContractShare.objects.create(
            contract=contract, family=family, is_originator=True
        )


def restore_nannies_from_contracts(apps, schema_editor):
    Contract = apps.get_model("tracking", "Contract")

    for contract in Contract.objects.select_related("nanny").all():
        nanny = contract.nanny
        nanny.owner_id = contract.created_by_id
        nanny.starting_date = contract.starting_date
        nanny.ending_date = contract.ending_date
        nanny.save(update_fields=["owner", "starting_date", "ending_date"])
    Contract.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("tracking", "0003_seed_minimum_wage"),
    ]

    operations = [
        migrations.RunPython(create_contracts_from_nannies, restore_nannies_from_contracts),
    ]
