import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import models

from accounts.models import Child, Family, FamilyMembership, User
from tracking.management.commands.populate_dev import DEMO_DOMAIN
from tracking.models import (
    BankHoliday,
    Contract,
    ContractSchedule,
    ContractShare,
    ContractTerms,
    Leave,
    MinimumWage,
    Nanny,
    ScheduleBlock,
)

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def dev_stack(settings):
    """The test runner forces DEBUG off; the command only ever runs on the dev
    stack, so put one back."""
    settings.DEBUG = True
    settings.ON_VERCEL = False


def test_refuses_to_run_with_debug_off(settings):
    settings.DEBUG = False
    with pytest.raises(CommandError, match="DEBUG is off"):
        call_command("populate_dev")
    assert not User.objects.exists()


def test_refuses_to_run_on_vercel(settings):
    settings.ON_VERCEL = True
    with pytest.raises(CommandError, match="Vercel"):
        call_command("populate_dev")
    assert not User.objects.exists()


@pytest.mark.parametrize("option", ["--families", "--nannies"])
def test_rejects_empty_counts(option):
    with pytest.raises(CommandError, match="1 or more"):
        call_command("populate_dev", option, "0")


def test_creates_the_whole_object_graph():
    call_command("populate_dev", "--families", "2", "--nannies", "2", verbosity=0)

    assert Family.objects.count() == 2
    assert Nanny.objects.count() == 2
    assert Child.objects.exists()
    # One contract per family, plus the shared one.
    assert Contract.objects.count() == 3
    for contract in Contract.objects.all():
        assert contract.current_terms() is not None
        assert contract.current_schedule() is not None
        assert contract.leaves.exists()
    assert ScheduleBlock.objects.exists()


def test_creates_a_superuser_and_family_owners_sharing_one_password():
    call_command("populate_dev", "--password", "hunter2", verbosity=0)

    admin = User.objects.get(email=f"admin@{DEMO_DOMAIN}")
    assert admin.is_superuser and admin.is_staff
    assert admin.check_password("hunter2")

    for family in Family.objects.all():
        owner = family.memberships.get(role=FamilyMembership.Role.OWNER).user
        assert owner.check_password("hunter2")


def test_every_account_sits_under_the_demo_domain():
    call_command("populate_dev", verbosity=0)
    assert not User.objects.exclude(email__endswith=f"@{DEMO_DOMAIN}").exists()


def test_shares_one_contract_between_two_families():
    call_command("populate_dev", "--families", "2", "--nannies", "2", verbosity=0)

    shared = Contract.objects.annotate(count=models.Count("shares")).get(count=2)
    assert shared.shares.filter(is_originator=True).count() == 1


def test_terms_and_schedules_keep_their_history():
    call_command("populate_dev", "--families", "1", "--nannies", "1", verbosity=0)

    contract = Contract.objects.get()
    # An opening rate and a raise: the current terms are the later, higher ones.
    terms = list(ContractTerms.objects.filter(contract=contract).order_by("effective_from"))
    assert len(terms) == 2
    assert terms[1].net_hourly_rate > terms[0].net_hourly_rate
    assert contract.current_terms() == terms[1]
    assert ContractSchedule.objects.filter(contract=contract).exists()


def test_demo_data_is_valid_against_the_models():
    """The command writes with .create(), which skips clean() — so check the
    dataset would survive the validation the API applies."""
    call_command("populate_dev", verbosity=0)

    for leave in Leave.objects.all():
        leave.full_clean(exclude=["created_by"])
    for block in ScheduleBlock.objects.all():
        block.full_clean(exclude=["schedule"])


def test_tops_up_the_global_reference_data():
    call_command("populate_dev", verbosity=0)

    assert BankHoliday.objects.exists()
    assert MinimumWage.objects.count() == 2


def test_same_seed_gives_the_same_dataset():
    call_command("populate_dev", "--seed", "7", verbosity=0)
    first = sorted(User.objects.values_list("email", flat=True))
    first_names = sorted(f"{n.first_name} {n.last_name}" for n in Nanny.objects.all())

    call_command("populate_dev", "--seed", "7", verbosity=0)

    assert sorted(User.objects.values_list("email", flat=True)) == first
    assert sorted(f"{n.first_name} {n.last_name}" for n in Nanny.objects.all()) == first_names


def test_different_seeds_give_different_datasets():
    call_command("populate_dev", "--seed", "1", verbosity=0)
    first = sorted(User.objects.values_list("email", flat=True))

    call_command("populate_dev", "--seed", "99", verbosity=0)

    assert sorted(User.objects.values_list("email", flat=True)) != first


def test_rerunning_resets_rather_than_piles_up():
    call_command("populate_dev", "--families", "2", "--nannies", "2", verbosity=0)
    call_command("populate_dev", "--families", "2", "--nannies", "2", verbosity=0)

    assert Family.objects.count() == 2
    assert Nanny.objects.count() == 2
    assert Contract.objects.count() == 3
    assert User.objects.filter(email=f"admin@{DEMO_DOMAIN}").count() == 1
    # Cascades reached the leaves of the graph, not just the roots.
    assert ContractShare.objects.count() == 4
    assert Leave.objects.count() == 12


def test_leaves_hand_made_local_data_alone(owner, family, contract):
    """Only accounts under the demo domain are the command's to wipe — the plain
    @example.com data of the shared fixtures must survive a re-run."""
    call_command("populate_dev", verbosity=0)
    call_command("populate_dev", verbosity=0)

    assert User.objects.filter(pk=owner.pk).exists()
    assert Family.objects.filter(pk=family.pk).exists()
    assert Contract.objects.filter(pk=contract.pk).exists()
    assert Nanny.objects.filter(pk=contract.nanny_id).exists()


def test_reports_the_logins_it_created(capsys):
    call_command("populate_dev", "--families", "1", "--password", "hunter2")

    out = capsys.readouterr().out
    assert f"admin@{DEMO_DOMAIN}" in out
    assert "hunter2" in out
    owner = Family.objects.get().memberships.get(role=FamilyMembership.Role.OWNER).user
    assert owner.email in out


def test_reports_what_a_rerun_removed(capsys):
    call_command("populate_dev", "--families", "1", verbosity=0)
    capsys.readouterr()

    call_command("populate_dev", "--families", "1")

    assert "demo account(s) from a previous run" in capsys.readouterr().out
