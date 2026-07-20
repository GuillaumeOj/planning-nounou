import datetime

import pytest
from rest_framework.test import APIClient

from accounts.models import Family, FamilyMembership, User
from contracts.models import Contract, ContractShare
from nannies.models import Nanny

VALID_PASSWORD = "sufficiently-long-pass-42"


@pytest.fixture(autouse=True)
def fast_password_hashing(settings):
    """Hash with MD5 rather than the default PBKDF2 (~1M iterations).

    Every account a test creates otherwise costs a real password hash, which
    dominates the suite's runtime — populate_dev alone mints 7 per run. Hashing
    strength is a production concern; no test asserts on it, and check_password
    still works.
    """
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def owner():
    return User.objects.create_user(email="owner@example.com", password=VALID_PASSWORD)


@pytest.fixture
def member():
    return User.objects.create_user(email="member@example.com", password=VALID_PASSWORD)


@pytest.fixture
def outsider():
    return User.objects.create_user(email="outsider@example.com", password=VALID_PASSWORD)


def make_family(user, *, name="Home", role=FamilyMembership.Role.OWNER):
    family = Family.objects.create(name=name, created_by=user)
    FamilyMembership.objects.create(family=family, user=user, role=role)
    return family


@pytest.fixture
def family(owner, member):
    """A family `owner` owns and `member` belongs to (as a plain member)."""
    fam = make_family(owner, name="Home")
    FamilyMembership.objects.create(family=fam, user=member, role=FamilyMembership.Role.MEMBER)
    return fam


@pytest.fixture
def other_family(outsider):
    return make_family(outsider, name="Other")


@pytest.fixture
def make_contract():
    def _make(
        family,
        *,
        created_by=None,
        first_name="Marie",
        last_name="Dupont",
        starting_date=datetime.date(2026, 1, 5),
        ending_date=None,
    ):
        nanny = Nanny.objects.create(
            first_name=first_name, last_name=last_name, created_by=created_by
        )
        contract = Contract.objects.create(
            nanny=nanny,
            created_by=created_by,
            starting_date=starting_date,
            ending_date=ending_date,
        )
        ContractShare.objects.create(contract=contract, family=family, is_originator=True)
        return contract

    return _make


@pytest.fixture
def contract(family, owner, make_contract):
    return make_contract(family, created_by=owner)
