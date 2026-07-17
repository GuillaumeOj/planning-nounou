"""Fill the dev database with a demo dataset: accounts, families, children,
nannies, contracts, schedules, leaves and the exceptional hours a month gets
declared with — enough to open the planning and see something.

Dev stack only (see ``_guard_dev_only``): it creates accounts with a known, weak
password, so it refuses to run with DEBUG off or on a Vercel deployment.

Everything it creates is addressed under ``DEMO_DOMAIN``, and every run starts by
wiping the accounts under that domain and what they own. A re-run therefore
resets the demo dataset and leaves hand-made local data alone — including
anything at plain ``@example.com``, which the tests and manual fiddling use.
Global reference data (bank holidays, minimum wage) is only ever topped up.

Same ``--seed``, same dataset.
"""

from __future__ import annotations

import random
from datetime import date, time, timedelta
from decimal import Decimal
from typing import TYPE_CHECKING, cast

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import Child, Family, FamilyMembership, User
from tracking.declarations import first_of_month
from tracking.declarations_repo import declarations_for, file_declaration
from tracking.models import (
    BankHoliday,
    Contract,
    ContractChild,
    ContractChildWindow,
    ContractSchedule,
    ContractShare,
    ContractTerms,
    ExceptionalHours,
    ExceptionalPresence,
    Leave,
    MinimumWage,
    Nanny,
    ScheduleBlock,
)

if TYPE_CHECKING:
    from argparse import ArgumentParser

# A subdomain of the reserved documentation domain: distinctive enough that the
# wipe above can never reach an address someone typed in by hand.
DEMO_DOMAIN = "demo.example.com"
DEFAULT_PASSWORD = "password"

# fmt: off
# ASCII-only on purpose — these end up in the local part of an email address.
FIRST_NAMES = [
    "Alice", "Antoine", "Camille", "Claire", "Hugo", "Julie", "Julien", "Laura",
    "Louis", "Manon", "Marie", "Maxime", "Nicolas", "Paul", "Pierre", "Sarah",
    "Sophie", "Thomas",
]
LAST_NAMES = [
    "Bernard", "Bertrand", "David", "Dubois", "Durand", "Fournier", "Garcia",
    "Laurent", "Lefebvre", "Leroy", "Martin", "Michel", "Moreau", "Petit",
    "Richard", "Robert", "Roux", "Simon", "Vincent",
]
CHILD_NAMES = [
    "Anna", "Arthur", "Ethan", "Gabriel", "Iris", "Jade", "Lea", "Nathan",
    "Noah", "Rose", "Tom", "Zoe",
]
# fmt: on

WORKING_DAYS = [
    ScheduleBlock.Weekday.MONDAY,
    ScheduleBlock.Weekday.TUESDAY,
    ScheduleBlock.Weekday.WEDNESDAY,
    ScheduleBlock.Weekday.THURSDAY,
    ScheduleBlock.Weekday.FRIDAY,
]


class Command(BaseCommand):
    help = "Fill the dev database with a demo dataset (accounts, families, contracts, plannings)."

    def add_arguments(self, parser: ArgumentParser) -> None:
        parser.add_argument(
            "--families", type=int, default=3, help="How many families to create (default 3)."
        )
        parser.add_argument(
            "--nannies", type=int, default=3, help="How many nannies to create (default 3)."
        )
        parser.add_argument(
            "--seed", type=int, default=1, help="Random seed; same seed, same dataset (default 1)."
        )
        parser.add_argument(
            "--password",
            default=DEFAULT_PASSWORD,
            help=f"Password shared by every demo account (default {DEFAULT_PASSWORD!r}).",
        )

    def handle(self, *args: object, **options: object) -> None:
        self._guard_dev_only()

        family_count = cast(int, options["families"])
        nanny_count = cast(int, options["nannies"])
        if family_count < 1 or nanny_count < 1:
            raise CommandError("--families and --nannies must be 1 or more.")

        password = cast(str, options["password"])
        rng = random.Random(cast(int, options["seed"]))

        with transaction.atomic():
            removed = self._flush()
            self._create_admin(password)
            families = [self._create_family(rng, password) for _ in range(family_count)]
            # Each nanny is credited to a family owner, rotating through them: a
            # nanny is nobody's property, but someone did enter her (Nanny.created_by).
            nannies = [
                self._create_nanny(rng, self._owner(families[index % len(families)]))
                for index in range(nanny_count)
            ]
            contracts = self._create_contracts(rng, families, nannies)
            self._seed_reference_data()
            # After seeding: it needs the holidays to exist before it can mark them.
            self._mark_worked_holidays(rng)

        self._report(removed, families, nannies, contracts, password)

    def _guard_dev_only(self) -> None:
        """Demo accounts share one weak password, so this must never reach a
        deployed database."""
        if settings.ON_VERCEL:
            raise CommandError("populate_dev never runs on a Vercel deployment.")
        if not settings.DEBUG:
            raise CommandError(
                "populate_dev only runs on the dev stack — DEBUG is off. "
                "Run it with `uv run tox -e populate`, which sets DEBUG and points at the "
                "dev database for you."
            )

    # --- teardown ---------------------------------------------------------

    def _flush(self) -> int:
        """Drop the previous run's dataset. Returns the number of accounts removed."""
        demo_users = User.objects.filter(email__endswith=f"@{DEMO_DOMAIN}")
        removed = demo_users.count()
        # `created_by` is SET_NULL everywhere, so everything reached *through* a demo
        # user must go before the users themselves do — after that the trail is cold.
        # Their order between themselves doesn't matter. Leaves and the rest of the
        # graph cascade from these three.
        Contract.objects.filter(created_by__in=demo_users).delete()
        Nanny.objects.filter(created_by__in=demo_users).delete()
        Family.objects.filter(created_by__in=demo_users).delete()
        demo_users.delete()
        return removed

    # --- people -----------------------------------------------------------

    def _create_admin(self, password: str) -> None:
        User.objects.create_superuser(
            email=f"admin@{DEMO_DOMAIN}", password=password, first_name="Admin", last_name="Demo"
        )

    def _unique_email(self, first_name: str, last_name: str) -> str:
        """first.last@domain, numbered on collision — the name pools are small
        enough that a run can draw the same pair twice.

        _flush cleared the domain at the top of this same transaction, so a demo
        address that exists right now is one this run just handed out.
        """
        base = f"{first_name}.{last_name}".lower()
        candidate = f"{base}@{DEMO_DOMAIN}"
        suffix = 2
        while User.objects.filter(email=candidate).exists():
            candidate = f"{base}{suffix}@{DEMO_DOMAIN}"
            suffix += 1
        return candidate

    def _create_user(self, rng: random.Random, last_name: str, password: str) -> User:
        first_name = rng.choice(FIRST_NAMES)
        return User.objects.create_user(
            email=self._unique_email(first_name, last_name),
            password=password,
            first_name=first_name,
            last_name=last_name,
        )

    def _create_family(self, rng: random.Random, password: str) -> Family:
        last_name = rng.choice(LAST_NAMES)
        owner = self._create_user(rng, last_name, password)
        family = Family.objects.create(name=f"Famille {last_name}", created_by=owner)
        FamilyMembership.objects.create(family=family, user=owner, role=FamilyMembership.Role.OWNER)
        # Most households have a second parent; they join as a plain member.
        if rng.random() < 0.7:
            partner = self._create_user(rng, last_name, password)
            FamilyMembership.objects.create(
                family=family,
                user=partner,
                role=FamilyMembership.Role.MEMBER,
                invited_by=owner,
            )
        for first_name in rng.sample(CHILD_NAMES, k=rng.randint(1, 3)):
            Child.objects.create(family=family, first_name=first_name)
        return family

    def _create_nanny(self, rng: random.Random, created_by: User) -> Nanny:
        return Nanny.objects.create(
            first_name=rng.choice(FIRST_NAMES),
            last_name=rng.choice(LAST_NAMES),
            created_by=created_by,
        )

    def _owner(self, family: Family) -> User:
        memberships = family.memberships.select_related("user")
        return memberships.get(role=FamilyMembership.Role.OWNER).user

    # --- contracts --------------------------------------------------------

    def _create_contracts(
        self, rng: random.Random, families: list[Family], nannies: list[Nanny]
    ) -> list[Contract]:
        contracts = [
            self._create_contract(rng, nannies[index % len(nannies)], [family])
            for index, family in enumerate(families)
        ]
        # One "garde partagée": a single nanny and contract, two families splitting the hours.
        if len(families) >= 2:
            nanny = nannies[len(families) % len(nannies)]
            contracts.append(self._create_contract(rng, nanny, families[:2]))
        return contracts

    def _create_contract(
        self, rng: random.Random, nanny: Nanny, families: list[Family]
    ) -> Contract:
        owner = self._owner(families[0])
        shared = len(families) > 1
        contract = Contract.objects.create(
            nanny=nanny,
            created_by=owner,
            starting_date=timezone.localdate() - timedelta(days=rng.randint(300, 700)),
            paid_leave_days=rng.choice([25, 27, 30]),
            # Only a garde partagée has anything to split, and the two methods
            # give different money for the same children — so show both.
            split_method=(
                Contract.SplitMethod.BY_CHILDREN if shared else Contract.SplitMethod.EQUAL
            ),
            notes="Demo contract — created by populate_dev.",
        )
        for position, family in enumerate(families):
            ContractShare.objects.create(
                contract=contract, family=family, is_originator=position == 0
            )
        self._create_contract_children(rng, contract, families)
        self._create_terms(rng, contract)
        self._create_schedules(rng, contract)
        self._create_leaves(rng, contract, owner)
        self._create_exceptional_hours(rng, contract, families, owner)
        self._file_past_declarations(contract, owner)
        return contract

    def _file_past_declarations(self, contract: Contract, owner: User) -> None:
        """File a couple of past months, so the filed states are seen in dev.

        The month one back is still inside its edit grace window — filed, yet
        editable in place — while the older one has locked. Both matter: the
        planning and declarations pages read very differently for the two, and the
        home page summarises the recent months off exactly these rows.
        """
        today = timezone.localdate()
        contract_month = contract.starting_date.replace(day=1)
        for months_back in (1, 4):
            month = first_of_month(today, -months_back)
            if month < contract_month:
                continue
            for row in declarations_for(contract, month):
                file_declaration(row, owner)

    def _create_contract_children(
        self, rng: random.Random, contract: Contract, families: list[Family]
    ) -> None:
        """Wire the contract to real children, and give the windows some shape.

        The two window cases worth seeing are the ones the split turns on: a child
        who only comes after school (so the split moves mid-afternoon), and a child
        with no Wednesday window at all (so the other family pays the whole day).
        Most children get no window, which is both the common case and the path a
        contract predating this feature takes.
        """
        for position, family in enumerate(families):
            children = list(family.children.all())
            for index, child in enumerate(children):
                link = ContractChild.objects.create(contract=contract, child=child)
                # A second child is often the school-age one, home from 16:30.
                if index == 1:
                    for day in WORKING_DAYS:
                        ContractChildWindow.objects.create(
                            contract_child=link,
                            weekday=day,
                            start_time=time(16, 30),
                            end_time=time(18, 30),
                        )
                # On a shared contract, one family off on Wednesdays: windows on
                # every other day, and none on Wednesday, which is what says
                # "absent" rather than "unrestricted".
                elif position == 1 and index == 0 and rng.random() < 0.7:
                    for day in WORKING_DAYS:
                        if day == ScheduleBlock.Weekday.WEDNESDAY:
                            continue
                        ContractChildWindow.objects.create(
                            contract_child=link,
                            weekday=day,
                            start_time=time(8, 0),
                            end_time=time(18, 30),
                        )

    def _create_exceptional_hours(
        self, rng: random.Random, contract: Contract, families: list[Family], owner: User
    ) -> None:
        """Cover every kind worth seeing, including the reconciliation path.

        Présence responsable is only created on a solo contract: art. 137.1
        excludes it from a garde partagée and the model rejects it there.
        """
        today = timezone.localdate()
        recent = today - timedelta(days=rng.randint(3, 20))
        ExceptionalHours.objects.create(
            contract=contract,
            family=families[0],
            created_by=owner,
            kind=ExceptionalHours.Kind.EFFECTIVE,
            start_date=recent,
            start_time=time(18, 30),
            end_date=recent,
            end_time=time(20, 0),
            notes="Rentrée tardive — demo.",
        )
        # A night across midnight, sometimes a disturbed one so the 1/3 tier shows.
        night = today - timedelta(days=rng.randint(21, 40))
        ExceptionalHours.objects.create(
            contract=contract,
            family=families[0],
            created_by=owner,
            kind=ExceptionalHours.Kind.NIGHT_PRESENCE,
            start_date=night,
            start_time=time(21, 0),
            end_date=night + timedelta(days=1),
            end_time=time(6, 0),
            interventions=rng.choice([0, 0, 2]),
            notes="Nuit — demo.",
        )
        if len(families) > 1:
            # Care both families needed at once: each files the *same* window,
            # marked shared, so each declares only its own contractual share and
            # neither's figure depends on the other. This is the path the "the
            # other family logged shared care, add yours" prompt is built for; one
            # family filed here, and the second's matching entry stands in for
            # having answered the prompt. Nobody would see it otherwise.
            shared_evening = today - timedelta(days=rng.randint(5, 15))
            for family in (families[0], families[1]):
                ExceptionalHours.objects.create(
                    contract=contract,
                    family=family,
                    created_by=owner,
                    kind=ExceptionalHours.Kind.EFFECTIVE,
                    is_shared=True,
                    start_date=shared_evening,
                    start_time=time(18, 30),
                    end_date=shared_evening,
                    end_time=time(21, 0),
                    notes="Soirée partagée — demo.",
                )
            # A child there outside their window: no extra hours, only a shifted
            # split — the case the two exceptional models exist to tell apart.
            link = contract.contract_children.filter(windows__isnull=False).first()
            if link is not None:
                day = today - timedelta(days=rng.randint(2, 10))
                ExceptionalPresence.objects.create(
                    contract=contract,
                    child=link.child,
                    created_by=owner,
                    date=day,
                    start_time=time(8, 30),
                    end_time=time(16, 30),
                    notes="Présence exceptionnelle — demo.",
                )
        else:
            ExceptionalHours.objects.create(
                contract=contract,
                family=families[0],
                created_by=owner,
                kind=ExceptionalHours.Kind.PRESENCE_RESPONSABLE,
                start_date=recent - timedelta(days=1),
                start_time=time(14, 0),
                end_date=recent - timedelta(days=1),
                end_time=time(17, 0),
                notes="Présence responsable — demo (garde simple only).",
            )

    def _create_terms(self, rng: random.Random, contract: Contract) -> None:
        """Two snapshots — the opening rate and a raise — so the history has depth
        and `current_terms` has something to pick."""
        rate = Decimal(rng.randrange(950, 1250)) / 100  # 9.50 – 12.50 € net/hour
        ContractTerms.objects.create(
            contract=contract,
            effective_from=contract.starting_date,
            net_hourly_rate=rate,
            transport_fee=Decimal(rng.choice(["0", "25.00", "40.00"])),
            mileage_rate=Decimal("0.150"),
        )
        ContractTerms.objects.create(
            contract=contract,
            # Comfortably after starting_date, which is 300+ days back.
            effective_from=timezone.localdate() - timedelta(days=180),
            net_hourly_rate=rate + Decimal("0.50"),
            # Varied on purpose: below the quarter floor on some contracts, so the
            # warning that lifts it to the legal minimum is visible in dev.
            night_presence_rate=Decimal(rng.choice(["0", "2.50", "4.00"])),
            transport_fee=Decimal(rng.choice(["0", "25.00", "40.00"])),
            mileage_rate=Decimal("0.150"),
            benefits_in_kind=Decimal(rng.choice(["0", "15.00"])),
        )

    def _create_schedules(self, rng: random.Random, contract: Contract) -> None:
        self._create_schedule(rng, contract, contract.starting_date)
        # Some contracts have re-arranged their week since; that later snapshot
        # becomes the current one and the first stays as history.
        if rng.random() < 0.5:
            self._create_schedule(rng, contract, timezone.localdate() - timedelta(days=90))

    def _create_schedule(
        self, rng: random.Random, contract: Contract, effective_from: date
    ) -> None:
        schedule = ContractSchedule.objects.create(contract=contract, effective_from=effective_from)
        start = rng.choice([time(8, 0), time(8, 30), time(9, 0)])
        end = rng.choice([time(17, 30), time(18, 0), time(18, 30)])
        # A Wednesday off and a half day are both common enough to be worth seeing
        # in the planning.
        days = list(WORKING_DAYS)
        if rng.random() < 0.4:
            days.remove(ScheduleBlock.Weekday.WEDNESDAY)
        half_day = rng.choice(days)
        for day in days:
            ScheduleBlock.objects.create(
                schedule=schedule,
                weekday=day,
                start_time=start,
                end_time=time(12, 30) if day == half_day else end,
            )

    def _create_leaves(self, rng: random.Random, contract: Contract, owner: User) -> None:
        today = timezone.localdate()
        past = today - timedelta(days=rng.randint(30, 120))
        Leave.objects.create(
            contract=contract,
            created_by=owner,
            leave_type=Leave.LeaveType.PAID,
            start_date=past,
            end_date=past + timedelta(days=4),
            notes="Vacances",
        )
        sick = today - timedelta(days=rng.randint(10, 25))
        Leave.objects.create(
            contract=contract,
            created_by=owner,
            leave_type=Leave.LeaveType.SICKNESS,
            start_date=sick,
            end_date=sick + timedelta(days=1),
        )
        # Hourly leaves are only legal on an unpaid one (see Leave.clean).
        Leave.objects.create(
            contract=contract,
            created_by=owner,
            leave_type=Leave.LeaveType.UNPAID,
            start_date=today - timedelta(days=7),
            end_date=today - timedelta(days=7),
            portion=Leave.Portion.HOURLY,
            hours=Decimal(rng.choice(["1.50", "2.00", "3.00"])),
            notes="Rendez-vous",
        )
        # One ahead of today, so the planning isn't empty looking forward.
        upcoming = today + timedelta(days=rng.randint(10, 40))
        Leave.objects.create(
            contract=contract,
            created_by=owner,
            leave_type=Leave.LeaveType.PAID,
            start_date=upcoming,
            end_date=upcoming + timedelta(days=4),
        )

    # --- global reference data --------------------------------------------

    def _mark_worked_holidays(self, rng: random.Random) -> None:
        """Both worked-holiday shapes, so neither is only ever seen in production.

        A jour férié ordinaire that was worked earns 10%; the journée de solidarité
        is worked and earns nothing. They are both `is_workable`, which is exactly
        why the second flag exists — and why the demo data should show both.
        """
        today = timezone.localdate()
        ordinary = (
            BankHoliday.objects.filter(date__year=today.year, is_workable=False)
            .exclude(date__month=5, date__day=1)
            .exclude(name__icontains="Pentec")
            .order_by("date")
            .first()
        )
        if ordinary is not None:
            ordinary.is_workable = True
            ordinary.save(update_fields=["is_workable"])
        solidarity = BankHoliday.objects.filter(
            date__year=today.year, name__icontains="Pentec"
        ).first()
        if solidarity is not None:
            solidarity.is_workable = True
            solidarity.is_solidarity = True
            solidarity.save(update_fields=["is_workable", "is_solidarity"])

    def _seed_reference_data(self) -> None:
        """Bank holidays and minimum wage are global and admin-managed, so they
        are topped up rather than owned by the demo dataset."""
        year = timezone.localdate().year
        for target in (year, year + 1):
            call_command("seed_bank_holidays", target, stdout=self.stdout)
        # Illustrative dev figures, not the authoritative URSSAF rates.
        for offset, net_hourly_rate in ((-1, Decimal("9.40")), (0, Decimal("9.60"))):
            MinimumWage.objects.get_or_create(
                effective_from=date(year + offset, 1, 1),
                defaults={"net_hourly_rate": net_hourly_rate},
            )

    # --- output -----------------------------------------------------------

    def _report(
        self,
        removed: int,
        families: list[Family],
        nannies: list[Nanny],
        contracts: list[Contract],
        password: str,
    ) -> None:
        if removed:
            self.stdout.write(f"Removed {removed} demo account(s) from a previous run.")
        children = Child.objects.filter(family__in=families).count()
        self.stdout.write(
            self.style.SUCCESS(
                f"Created {len(families)} families, {children} children, {len(nannies)} nannies "
                f"and {len(contracts)} contracts (with terms, schedules and leaves)."
            )
        )
        self.stdout.write(f"\nEvery account below logs in with: {password}\n")
        self.stdout.write(f"  admin@{DEMO_DOMAIN}  (superuser)")
        for family in families:
            self.stdout.write(f"  {family.name}")
            for membership in family.memberships.select_related("user").order_by("joined_at"):
                self.stdout.write(f"    {membership.user.email}  ({membership.role})")
