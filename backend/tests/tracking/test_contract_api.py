import pytest
from django.urls import reverse

from tracking.models import Contract, ContractShare, Nanny

pytestmark = pytest.mark.django_db


def contracts_url(family):
    return reverse("tracking:family-contracts", args=[family.id])


def contract_url(family, contract):
    return reverse("tracking:family-contract", args=[family.id, contract.id])


def test_create_contract_creates_nanny_and_originator_share(client, owner, family):
    client.force_authenticate(user=owner)

    resp = client.post(
        contracts_url(family),
        {"first_name": "Marie", "last_name": "Dupont", "starting_date": "2026-01-05"},
        format="json",
    )

    assert resp.status_code == 201
    assert resp.data["nanny"]["first_name"] == "Marie"
    contract = Contract.objects.get(id=resp.data["id"])
    assert Nanny.objects.filter(id=contract.nanny_id, created_by=owner).exists()
    share = ContractShare.objects.get(contract=contract, family=family)
    assert share.is_originator is True
    assert resp.data["current_terms"] is None
    assert resp.data["current_schedule"] is None


def test_create_requires_manage_rights(client, member, family):
    # `member` is a plain member, not an owner: cannot create contracts.
    client.force_authenticate(user=member)

    resp = client.post(
        contracts_url(family),
        {"first_name": "Marie", "last_name": "Dupont", "starting_date": "2026-01-05"},
        format="json",
    )

    assert resp.status_code == 403


def test_create_rejects_ending_before_starting(client, owner, family):
    client.force_authenticate(user=owner)

    resp = client.post(
        contracts_url(family),
        {
            "first_name": "Paul",
            "last_name": "Martin",
            "starting_date": "2026-06-30",
            "ending_date": "2025-03-01",
        },
        format="json",
    )

    assert resp.status_code == 400
    assert "ending_date" in resp.data


def test_error_is_localized_to_french(client, owner, family):
    client.force_authenticate(user=owner)

    resp = client.post(
        contracts_url(family),
        {
            "first_name": "Paul",
            "last_name": "Martin",
            "starting_date": "2026-06-30",
            "ending_date": "2025-03-01",
        },
        format="json",
        HTTP_ACCEPT_LANGUAGE="fr",
    )

    assert resp.status_code == 400
    assert resp.data["ending_date"][0] == (
        "La date de fin ne peut pas être antérieure à la date de début."
    )


def test_create_requires_authentication(client, family):
    resp = client.post(
        contracts_url(family),
        {"first_name": "Marie", "last_name": "Dupont", "starting_date": "2026-01-05"},
        format="json",
    )
    assert resp.status_code == 401


def test_list_returns_only_the_familys_contracts(
    client, owner, family, other_family, make_contract
):
    make_contract(family, first_name="Ours")
    make_contract(other_family, first_name="Theirs")
    client.force_authenticate(user=owner)

    resp = client.get(contracts_url(family))

    assert resp.status_code == 200
    assert [c["nanny"]["first_name"] for c in resp.data] == ["Ours"]


def test_non_member_cannot_access_family_contracts(client, outsider, family):
    client.force_authenticate(user=outsider)
    assert client.get(contracts_url(family)).status_code == 403


def test_member_can_read_but_not_write(client, member, family, make_contract):
    make_contract(family)
    client.force_authenticate(user=member)
    assert client.get(contracts_url(family)).status_code == 200


def test_update_contract_edits_nanny_name(client, owner, family, contract):
    client.force_authenticate(user=owner)

    resp = client.patch(
        contract_url(family, contract),
        {"first_name": "Renamed"},
        format="json",
    )

    assert resp.status_code == 200
    contract.nanny.refresh_from_db()
    assert contract.nanny.first_name == "Renamed"


def test_delete_contract(client, owner, family, contract):
    client.force_authenticate(user=owner)
    resp = client.delete(contract_url(family, contract))
    assert resp.status_code == 204
    assert not Contract.objects.filter(id=contract.id).exists()


def test_update_requires_manage_rights(client, member, family, contract):
    client.force_authenticate(user=member)
    resp = client.patch(contract_url(family, contract), {"notes": "x"}, format="json")
    assert resp.status_code == 403


def test_create_with_paid_leave_days(client, owner, family):
    client.force_authenticate(user=owner)
    resp = client.post(
        contracts_url(family),
        {
            "first_name": "Marie",
            "last_name": "Dupont",
            "starting_date": "2026-01-05",
            "paid_leave_days": 25,
        },
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["paid_leave_days"] == 25


def test_create_requires_a_nanny_or_names(client, owner, family):
    client.force_authenticate(user=owner)
    resp = client.post(contracts_url(family), {"starting_date": "2026-01-05"}, format="json")
    assert resp.status_code == 400
    assert "nanny_id" in resp.data


def test_reuse_an_existing_nanny_of_the_family(client, owner, family, contract):
    client.force_authenticate(user=owner)
    resp = client.post(
        contracts_url(family),
        {"nanny_id": contract.nanny_id, "starting_date": "2026-02-01"},
        format="json",
    )
    assert resp.status_code == 201
    assert resp.data["nanny"]["id"] == str(contract.nanny_id)
    assert Contract.objects.filter(nanny_id=contract.nanny_id).count() == 2


def test_reuse_rejects_a_nanny_not_linked_to_the_family(
    client, owner, family, other_family, make_contract
):
    foreign = make_contract(other_family)
    client.force_authenticate(user=owner)
    resp = client.post(
        contracts_url(family),
        {"nanny_id": foreign.nanny_id, "starting_date": "2026-02-01"},
        format="json",
    )
    assert resp.status_code == 400
    assert "nanny_id" in resp.data


def attach_family_url(family, contract):
    return reverse("tracking:contract-attach-family", args=[family.id, contract.id])


def test_attach_family_the_user_also_manages(client, owner, family, contract):
    # A family the owner set up on someone's behalf: unclaimed, no members, so the
    # creator manages it. It can be joined to the contract without an invitation.
    from accounts.models import Family

    behalf = Family.objects.create(name="Behalf", created_by=owner)
    client.force_authenticate(user=owner)

    resp = client.post(
        attach_family_url(family, contract), {"family_id": str(behalf.id)}, format="json"
    )

    assert resp.status_code == 200
    assert ContractShare.objects.filter(
        contract=contract, family=behalf, is_originator=False
    ).exists()
    assert {str(f["id"]) for f in resp.data["families"]} == {
        str(family.id),
        str(behalf.id),
    }


def test_attach_family_is_idempotent(client, owner, family, contract):
    from accounts.models import Family

    behalf = Family.objects.create(name="Behalf", created_by=owner)
    client.force_authenticate(user=owner)
    url = attach_family_url(family, contract)
    client.post(url, {"family_id": str(behalf.id)}, format="json")
    client.post(url, {"family_id": str(behalf.id)}, format="json")
    assert ContractShare.objects.filter(contract=contract, family=behalf).count() == 1


def test_attach_family_rejects_one_you_do_not_manage(client, owner, family, contract, other_family):
    client.force_authenticate(user=owner)
    resp = client.post(
        attach_family_url(family, contract),
        {"family_id": str(other_family.id)},
        format="json",
    )
    assert resp.status_code == 403
    assert not ContractShare.objects.filter(contract=contract, family=other_family).exists()


def test_attach_family_requires_a_family_id(client, owner, family, contract):
    client.force_authenticate(user=owner)
    resp = client.post(attach_family_url(family, contract), {}, format="json")
    assert resp.status_code == 400


def test_attach_family_requires_manage_rights_on_acting_family(client, member, family, contract):
    client.force_authenticate(user=member)
    resp = client.post(
        attach_family_url(family, contract), {"family_id": str(family.id)}, format="json"
    )
    assert resp.status_code == 403
