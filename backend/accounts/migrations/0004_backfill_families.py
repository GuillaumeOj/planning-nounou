"""Backfill a Family for every existing parent and repoint their children.

Each user that currently has children gets one family (with the user as its
owner), and every one of that user's children is moved onto that family. This
runs between the additive schema migration (0003) and the destructive one
(0005) that drops ``Child.parent``.
"""

from django.db import migrations


def create_families_from_parents(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    Family = apps.get_model("accounts", "Family")
    FamilyMembership = apps.get_model("accounts", "FamilyMembership")
    Child = apps.get_model("accounts", "Child")

    for user in User.objects.filter(children__isnull=False).distinct():
        name = (user.first_name.strip() or user.email) + "'s family"
        family = Family.objects.create(name=name, created_by=user)
        FamilyMembership.objects.create(family=family, user=user, role="owner")
        Child.objects.filter(parent=user).update(family=family)


def reverse(apps, schema_editor):
    """Repoint children back to their family's creator, then drop the families."""
    Family = apps.get_model("accounts", "Family")
    Child = apps.get_model("accounts", "Child")

    for family in Family.objects.filter(created_by__isnull=False):
        Child.objects.filter(family=family).update(parent=family.created_by)
    Family.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_family_membership_invitation"),
    ]

    operations = [
        migrations.RunPython(create_families_from_parents, reverse),
    ]
