"""Verify the parent -> family backfill (migration 0004) end to end.

Seeds pre-migration data via the historical model state, runs the migrations
forward, and asserts each parent's children land on a new owned family.
"""

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

APP = "accounts"
FROM = [(APP, "0002_child")]
TO = [(APP, "0005_drop_child_parent")]


@pytest.mark.django_db(transaction=True)
def test_backfill_moves_children_to_owned_family():
    # Roll back to just before the new models existed.
    executor = MigrationExecutor(connection)
    executor.migrate(FROM)
    old_apps = executor.loader.project_state(FROM).apps

    User = old_apps.get_model(APP, "User")
    Child = old_apps.get_model(APP, "Child")
    parent = User.objects.create(email="backfill@example.com", password="x", first_name="Dana")
    Child.objects.create(parent=parent, first_name="Kid A")
    Child.objects.create(parent=parent, first_name="Kid B")

    # Run the additive schema + data + destructive migrations forward.
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate(TO)
    new_apps = executor.loader.project_state(TO).apps

    Child = new_apps.get_model(APP, "Child")
    Family = new_apps.get_model(APP, "Family")
    FamilyMembership = new_apps.get_model(APP, "FamilyMembership")

    families = Family.objects.all()
    assert families.count() == 1
    family = families.get()
    assert family.created_by_id == parent.id
    assert family.name == "Dana's family"
    assert FamilyMembership.objects.filter(family=family, user_id=parent.id, role="owner").exists()
    assert set(Child.objects.values_list("first_name", flat=True)) == {"Kid A", "Kid B"}
    assert all(c.family_id == family.id for c in Child.objects.all())

    # Leave the DB fully migrated for the rest of the suite.
    executor = MigrationExecutor(connection)
    executor.loader.build_graph()
    executor.migrate(executor.loader.graph.leaf_nodes())
