"""The only place the pay domain touches the database.

:mod:`contracts.declarations` is pure and knows nothing of Django; this module is
the seam. It loads one month of one contract into that module's frozen
dataclasses, in a fixed number of queries, and writes the result back.

**The whole month is fetched once, for every family.** ``compute_month`` is then
a function of its argument, so four families cost what one does. The naive shape —
resolving ``contract.current_schedule(day)`` per family per day — is a query each,
hundreds a month, and it is the obvious thing to write.

Four traps live here, all of which read as correct:

* ``effective_from__gte=month_start`` is the tempting filter and it is wrong: it
  drops the snapshot *in force at the month's start*, which is the one nearly
  every month needs. Fetch ``__lte=month_end`` and resolve per date in Python.
* ``prefetch_related("windows")`` followed by ``.filter(weekday=...)`` in a loop
  **re-queries** — a filtered related manager is re-evaluated, silently defeating
  the prefetch. Group into a dict once, per child.
* A ``Leave`` needs an *overlap* filter. ``start_date__month=`` misses one that
  began last month and runs into this one.
* ``ExceptionalHours`` must be loaded for **every** family on the contract, not
  the acting one: family A's declared hours depend on whether B filed an
  overlapping entry. Reading them all is the point; writing is another matter
  entirely (see the viewset).
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone

from contracts import declarations, paid_leave, paid_leave_tenth, simulation
from contracts.models import (
    Contract,
    ContractChild,
    ContractSchedule,
    ContractTerms,
    ExceptionalHours,
    ExceptionalPresence,
    Leave,
    MonthlyDeclaration,
)
from reference.models import BankHoliday, SalaryContributionRate

if TYPE_CHECKING:
    from datetime import date
    from uuid import UUID


def load_contract_month(
    contract: Contract, month: date, *, kilometers: dict[UUID, Decimal] | None = None
) -> declarations.ContractMonth:
    """One month of one contract, as the pure domain wants it."""
    first, last = declarations.month_bounds(month)

    family_ids = tuple(
        share.family_id for share in contract.shares.all().order_by("added_at", "id")
    )

    schedules = tuple(
        declarations.Schedule(
            effective_from=schedule.effective_from,
            blocks=tuple(
                declarations.Block(weekday=b.weekday, start=b.start_time, end=b.end_time)
                for b in schedule.blocks.all()
            ),
        )
        # __lte, never __gte: the month's opening schedule is usually older than it.
        for schedule in ContractSchedule.objects.filter(contract=contract, effective_from__lte=last)
        .order_by("effective_from", "id")
        .prefetch_related("blocks")
    )

    terms = tuple(
        declarations.Terms(
            effective_from=row.effective_from,
            net_hourly_rate=row.net_hourly_rate,
            night_presence_rate=row.night_presence_rate,
            transport_fee=row.transport_fee,
            mileage_rate=row.mileage_rate,
            benefits_in_kind=row.benefits_in_kind,
        )
        for row in ContractTerms.objects.filter(
            contract=contract, effective_from__lte=last
        ).order_by("effective_from", "id")
    )

    children = tuple(
        declarations.ChildPresence(
            child_id=link.child_id,
            family_id=link.child.family_id,
            # Grouped here, once. Filtering link.windows per weekday inside the
            # segmentation loop would re-query on every block of every day.
            windows=tuple(
                declarations.Window(weekday=w.weekday, start=w.start_time, end=w.end_time)
                for w in link.windows.all()
            ),
        )
        for link in ContractChild.objects.filter(contract=contract)
        .select_related("child")
        .prefetch_related("windows")
    )

    leaves = tuple(
        declarations.LeaveSpan(
            leave_type=leave.leave_type,
            start_date=leave.start_date,
            end_date=leave.end_date,
            portion=leave.portion,
            hours=leave.hours,
        )
        # Overlap, not start_date__month: a leave running in from last month counts.
        for leave in Leave.objects.filter(
            contract=contract, start_date__lte=last, end_date__gte=first
        )
    )

    exceptional = tuple(
        declarations.ExceptionalEntry(
            family_id=entry.family_id,
            kind=entry.kind,
            start_date=entry.start_date,
            start_time=entry.start_time,
            end_date=entry.end_date,
            end_time=entry.end_time,
            interventions=entry.interventions,
            is_shared=entry.is_shared,
        )
        # Every family's, deliberately: a shared entry splits between them, and the
        # overlapping-solo warning needs to see both families' rows at once.
        for entry in ExceptionalHours.objects.filter(
            contract=contract, start_date__lte=last, end_date__gte=first
        ).order_by("start_date", "start_time", "id")
    )

    overrides = tuple(
        declarations.PresenceOverride(
            child_id=presence.child_id,
            day=presence.date,
            start=presence.start_time,
            end=presence.end_time,
        )
        for presence in ExceptionalPresence.objects.filter(
            contract=contract, date__range=(first, last)
        )
    )

    holidays = tuple(
        declarations.Holiday(day=h.date, is_workable=h.is_workable, is_solidarity=h.is_solidarity)
        for h in BankHoliday.objects.filter(date__range=(first, last))
    )

    return declarations.ContractMonth(
        month=first,
        starting_date=contract.starting_date,
        ending_date=contract.ending_date,
        split_method=contract.split_method,
        family_ids=family_ids,
        children=children,
        schedules=schedules,
        terms=terms,
        leaves=leaves,
        exceptional=exceptional,
        overrides=overrides,
        holidays=holidays,
        kilometers=kilometers,
    )


def paid_leave_balance(contract: Contract, on: date | None = None) -> paid_leave.PaidLeaveBalance:
    """One contract's congés-payés balance for the reference period around ``on``.

    Loads only what the balance needs — the schedules (to know which days are
    worked), the paid leaves overlapping the period, and the non-workable holidays
    inside it — and hands them to the pure :mod:`contracts.paid_leave` domain.
    """
    on = on or timezone.localdate()
    period_start, period_end = paid_leave.reference_period(on)

    schedules = tuple(
        declarations.Schedule(
            effective_from=schedule.effective_from,
            blocks=tuple(
                declarations.Block(weekday=b.weekday, start=b.start_time, end=b.end_time)
                for b in schedule.blocks.all()
            ),
        )
        # __lte, never __gte: the period's opening schedule is usually older than it.
        for schedule in ContractSchedule.objects.filter(
            contract=contract, effective_from__lte=period_end
        )
        .order_by("effective_from", "id")
        .prefetch_related("blocks")
    )

    leaves = tuple(
        declarations.LeaveSpan(
            leave_type=leave.leave_type,
            start_date=leave.start_date,
            end_date=leave.end_date,
            portion=leave.portion,
            hours=leave.hours,
        )
        # Overlap, not a single-month filter: a leave running in from before the
        # period, or out past its end, still spends its days inside it.
        for leave in Leave.objects.filter(
            contract=contract,
            leave_type=Leave.LeaveType.PAID,
            start_date__lte=period_end,
            end_date__gte=period_start,
        )
    )

    holidays = tuple(
        declarations.Holiday(day=h.date, is_workable=h.is_workable, is_solidarity=h.is_solidarity)
        for h in BankHoliday.objects.filter(date__range=(period_start, period_end))
    )

    return paid_leave.compute_balance(
        paid_leave_days=contract.paid_leave_days,
        contract_start=contract.starting_date,
        contract_end=contract.ending_date,
        schedules=schedules,
        leaves=leaves,
        holidays=holidays,
        on=on,
    )


def tenth_reconciliation(
    contract: Contract, on: date | None = None
) -> dict[UUID, paid_leave_tenth.TenthReconciliation]:
    """Each family's congés-payés « rappel de 1/10 » for the reference period around ``on``.

    Per family, because each is a distinct pajemploi employer that declares and owes
    its own rappel: sums that family's whole *année de référence* — twelve months of
    :func:`declarations_for`'s computation — into the 1/10 base (art. L3141-24), values
    the paid-leave days it paid as maintien de salaire, and compares the two in brut.
    Returns an empty dict when no cotisations-salariales rate is on file to cross the
    net⇄brut line, so the caller omits the figure rather than invent a basis.

    Recomputed live rather than read from stored :class:`MonthlyDeclaration` rows: the
    dashboard wants a running estimate for a period whose months mostly are not filed
    yet, and a live recompute is the same number ``declarations_for`` would write.
    """
    on = on or timezone.localdate()
    period_start, period_end = paid_leave.reference_period(on)

    rate = SalaryContributionRate.applicable_on(period_end)
    if rate is None:
        return {}

    period = _load_contract_period(contract, period_start, period_end)
    if not period.family_ids:
        return {}

    # The assiette: each family's whole-month pay, summed over the twelve months. The
    # whole reference year is loaded ONCE (compute_month clips the leaves, holidays and
    # exceptional hours to each month itself), so this stays a handful of queries whether
    # it runs for one contract or a dashboard full of them.
    assiette_net: dict[UUID, Decimal] = {fid: Decimal("0") for fid in period.family_ids}
    for offset in range(declarations.MONTHS_PER_YEAR):
        data = declarations.ContractMonth(
            month=declarations.first_of_month(period_start, offset),
            starting_date=contract.starting_date,
            ending_date=contract.ending_date,
            split_method=contract.split_method,
            family_ids=period.family_ids,
            children=period.children,
            schedules=period.schedules,
            terms=period.terms,
            leaves=period.leaves,
            exceptional=period.exceptional,
            overrides=period.overrides,
            holidays=period.holidays,
        )
        for family_id, result in declarations.compute_month(data).items():
            assiette_net[family_id] += paid_leave_tenth.assiette_of(result)

    non_workable = frozenset(h.day for h in period.holidays if not h.is_workable)
    banded_by_date = _period_banded_by_date(
        period.schedules,
        period.children_by_id,
        contract.split_method,
        period.family_ids,
        period_start,
        period_end,
    )

    # The maintien the tenth is measured against is the ACQUIRED entitlement (which the
    # mensualised pay already carries), not the leave taken: acquired days × each family's
    # weekly base salary, taken from the contract's current week and rate.
    rep_date = min(period_end, contract.ending_date) if contract.ending_date else period_end
    rep_terms = declarations.in_force(period.terms, rep_date)
    accrued = paid_leave.accrued_days(
        contract.paid_leave_days, period_start, period_end, contract.starting_date, rep_date
    )
    maintien_entitlement = paid_leave_tenth.maintien_entitlement(
        accrued_days=accrued,
        week=banded_by_date.get(rep_date),
        net_hourly_rate=rep_terms.net_hourly_rate if rep_terms else Decimal("0"),
        family_ids=period.family_ids,
    )
    # The maintien for leave actually taken feeds the indemnité compensatrice (entitlement
    # − taken), the value of leave acquired but not taken, owed when the contract ends.
    maintien_taken = paid_leave_tenth.maintien_by_family(
        leaves=period.leaves,
        banded_by_date=banded_by_date,
        terms=period.terms,
        non_workable=non_workable,
        family_ids=period.family_ids,
        period_start=period_start,
        period_end=period_end,
        contract_start=contract.starting_date,
        contract_end=contract.ending_date,
    )

    return {
        family_id: paid_leave_tenth.reconcile_tenth(
            period_start=period_start,
            period_end=period_end,
            assiette_net=assiette_net.get(family_id, Decimal("0")),
            maintien_net=maintien_entitlement.get(family_id, Decimal("0")),
            maintien_taken_net=maintien_taken.get(family_id, Decimal("0")),
            contribution_rate=rate,
        )
        for family_id in period.family_ids
    }


def tenth_reconciliation_total(
    contract: Contract, on: date | None = None
) -> paid_leave_tenth.TenthReconciliation | None:
    """The contract's whole-nanny « rappel de 1/10 », families folded into one.

    The per-family figures (each its own pajemploi line) summed for the dashboard,
    which shows one running estimate for the contract. ``None`` when there is nothing
    to reconcile (no rate on file, or no families).
    """
    by_family = tenth_reconciliation(contract, on)
    if not by_family:
        return None
    recs = list(by_family.values())
    first = recs[0]

    def total(field: str) -> Decimal:
        return sum((getattr(r, field) for r in recs), Decimal("0"))

    return paid_leave_tenth.TenthReconciliation(
        period_start=first.period_start,
        period_end=first.period_end,
        contribution_rate=first.contribution_rate,
        assiette_brut=total("assiette_brut"),
        tenth_brut=total("tenth_brut"),
        maintien_brut=total("maintien_brut"),
        rappel_brut=total("rappel_brut"),
        rappel_net=total("rappel_net"),
        compensatrice_brut=total("compensatrice_brut"),
        compensatrice_net=total("compensatrice_net"),
    )


@dataclass(frozen=True, slots=True)
class _ContractPeriod:
    """One reference year of a contract, loaded once as the pure dataclasses.

    Everything :func:`tenth_reconciliation` needs to run twelve months of
    ``compute_month`` and price the maintien, in a fixed number of queries — not one
    load per month. ``compute_month`` clips the month-scoped tuples (leaves, holidays,
    exceptional, overrides) to each month itself, so the same tuples serve all twelve.
    """

    family_ids: tuple[UUID, ...]
    schedules: tuple[declarations.Schedule, ...]
    terms: tuple[declarations.Terms, ...]
    children: tuple[declarations.ChildPresence, ...]
    children_by_id: dict[UUID, declarations.ChildPresence]
    leaves: tuple[declarations.LeaveSpan, ...]
    exceptional: tuple[declarations.ExceptionalEntry, ...]
    overrides: tuple[declarations.PresenceOverride, ...]
    holidays: tuple[declarations.Holiday, ...]


def _load_contract_period(
    contract: Contract, period_start: date, period_end: date
) -> _ContractPeriod:
    """Load a contract's whole reference period once, as the pure dataclasses."""
    family_ids = tuple(
        share.family_id for share in contract.shares.all().order_by("added_at", "id")
    )
    schedules = tuple(
        declarations.Schedule(
            effective_from=s.effective_from,
            blocks=tuple(
                declarations.Block(weekday=b.weekday, start=b.start_time, end=b.end_time)
                for b in s.blocks.all()
            ),
        )
        for s in ContractSchedule.objects.filter(contract=contract, effective_from__lte=period_end)
        .order_by("effective_from", "id")
        .prefetch_related("blocks")
    )
    terms = tuple(
        declarations.Terms(
            effective_from=row.effective_from,
            net_hourly_rate=row.net_hourly_rate,
            night_presence_rate=row.night_presence_rate,
            transport_fee=row.transport_fee,
            mileage_rate=row.mileage_rate,
            benefits_in_kind=row.benefits_in_kind,
        )
        for row in ContractTerms.objects.filter(
            contract=contract, effective_from__lte=period_end
        ).order_by("effective_from", "id")
    )
    children_by_id = {
        link.child_id: declarations.ChildPresence(
            child_id=link.child_id,
            family_id=link.child.family_id,
            windows=tuple(
                declarations.Window(weekday=w.weekday, start=w.start_time, end=w.end_time)
                for w in link.windows.all()
            ),
        )
        for link in ContractChild.objects.filter(contract=contract)
        .select_related("child")
        .prefetch_related("windows")
    }
    # Overlap filters, not single-month: a leave or an entry straddling the period's
    # edge still spends its days inside it. compute_month clips per month.
    leaves = tuple(
        declarations.LeaveSpan(
            leave_type=leave.leave_type,
            start_date=leave.start_date,
            end_date=leave.end_date,
            portion=leave.portion,
            hours=leave.hours,
        )
        for leave in Leave.objects.filter(
            contract=contract, start_date__lte=period_end, end_date__gte=period_start
        )
    )
    exceptional = tuple(
        declarations.ExceptionalEntry(
            family_id=entry.family_id,
            kind=entry.kind,
            start_date=entry.start_date,
            start_time=entry.start_time,
            end_date=entry.end_date,
            end_time=entry.end_time,
            interventions=entry.interventions,
            is_shared=entry.is_shared,
        )
        for entry in ExceptionalHours.objects.filter(
            contract=contract, start_date__lte=period_end, end_date__gte=period_start
        ).order_by("start_date", "start_time", "id")
    )
    overrides = tuple(
        declarations.PresenceOverride(
            child_id=p.child_id, day=p.date, start=p.start_time, end=p.end_time
        )
        for p in ExceptionalPresence.objects.filter(
            contract=contract, date__range=(period_start, period_end)
        )
    )
    holidays = tuple(
        declarations.Holiday(day=h.date, is_workable=h.is_workable, is_solidarity=h.is_solidarity)
        for h in BankHoliday.objects.filter(date__range=(period_start, period_end))
    )
    return _ContractPeriod(
        family_ids=family_ids,
        schedules=schedules,
        terms=terms,
        children=tuple(children_by_id.values()),
        children_by_id=children_by_id,
        leaves=leaves,
        exceptional=exceptional,
        overrides=overrides,
        holidays=holidays,
    )


def _period_banded_by_date(
    schedules: tuple[declarations.Schedule, ...],
    children: dict[UUID, declarations.ChildPresence],
    split_method: str,
    family_ids: tuple[UUID, ...],
    period_start: date,
    period_end: date,
) -> dict[date, declarations.WeekBands]:
    """The per-weekday, per-family banding of every date in the reference period.

    The same shape :func:`declarations.build_base` builds a month at a time, here
    spanning the year so :func:`paid_leave_tenth.maintien_by_family` can read each
    family's share of a paid-leave day. Each in-force schedule's week is banded once
    and reused across the dates it governs.
    """
    week_cache: dict[date, declarations.WeekBands] = {}
    banded: dict[date, declarations.WeekBands] = {}
    for day in declarations.days_between(period_start, period_end):
        schedule = declarations.in_force(schedules, day)
        if schedule is None:
            continue
        week = week_cache.get(schedule.effective_from)
        if week is None:
            week = declarations.band_week(schedule, children, split_method, family_ids)
            week_cache[schedule.effective_from] = week
        banded[day] = week
    return banded


def _kilometers_on_file(contract: Contract, month: date) -> dict[UUID, Decimal]:
    """Kilometres already entered for this month, so recomputing keeps them."""
    return {
        row.family_id: row.kilometers
        for row in MonthlyDeclaration.objects.filter(contract=contract, month=month)
    }


@transaction.atomic
def declarations_for(contract: Contract, month: date) -> list[MonthlyDeclaration]:
    """Every family's declaration for `month`, recomputed unless already filed.

    A DRAFT is a view of live data and is refreshed on every read — so editing a
    schedule shows up rather than lurking. A FILED one is the record of what was
    actually sent to pajemploi and is never touched again, whatever happens to the
    terms, the windows or the children afterwards. That freeze is what lets the
    presence models stay flat instead of effective-dated.
    """
    first, _ = declarations.month_bounds(month)
    # Serialise concurrent recomputes of the same contract. A list read computes
    # and writes *both* families' rows, so two families opening the month at the
    # same time would each find no row for the other and each INSERT it, tripping
    # uniq_declaration_per_family_month with a 500. Locking the contract row makes
    # the second recompute wait for the first to commit, then find the rows it
    # wrote. Cheap — one contract, a handful of families, a couple of times a day.
    Contract.objects.select_for_update().filter(pk=contract.pk).first()
    existing = {
        row.family_id: row
        for row in MonthlyDeclaration.objects.filter(contract=contract, month=first)
    }
    data = load_contract_month(contract, first, kilometers=_kilometers_on_file(contract, first))
    results = declarations.compute_month(data)

    # The congés-payés rappel is settled once a year: compute it only on the reference
    # period's closing month (May) or the contract's final month, and leave it NULL
    # otherwise. Reconciling the whole année de référence is the heavy part, so it is
    # gated behind that check rather than run on every month's read.
    rappels = (
        tenth_reconciliation(contract, on=first)
        if _closes_reference_period(contract, first)
        else {}
    )

    # The indemnité compensatrice (untaken leave cashed out) is due only when the
    # contract ends — not at a regular May close, where untaken leave is lost or carried.
    final_month = _is_contract_final_month(contract, first)

    rows: list[MonthlyDeclaration] = []
    for family_id in data.family_ids:
        row = existing.get(family_id)
        if row is not None and row.is_frozen:
            rows.append(row)
            continue
        result = results.get(family_id)
        if result is None:
            continue
        is_new = row is None
        if is_new:
            row = MonthlyDeclaration(contract=contract, family_id=family_id, month=first)
        reconciliation = rappels.get(family_id)
        rappel = reconciliation.rappel_net if reconciliation is not None else None
        detail = _tenth_detail(reconciliation) if reconciliation is not None else None
        compensatrice = (
            reconciliation.compensatrice_net if reconciliation is not None and final_month else None
        )
        changed = _apply(
            row,
            result,
            paid_leave_rappel=rappel,
            paid_leave_tenth=detail,
            paid_leave_compensatrice=compensatrice,
        )
        # A new row must be written; an existing one only when its numbers actually
        # moved. Merely opening the home dashboard reads several months across every
        # contract, and each read recomputes; without this it would also rewrite
        # every unchanged draft (and bump its computed_at) on every load.
        if is_new or changed:
            row.save()
        rows.append(row)
    return rows


def _closes_reference_period(contract: Contract, first: date) -> bool:
    """Is ``first``'s month where a congés-payés reference period is settled?

    Either May — the 1 June–31 May année de référence's close — or the contract's
    final month, when the rappel falls due with the solde de tout compte.
    """
    if first.month == paid_leave.REFERENCE_PERIOD_START_MONTH - 1:  # May, the period's last month
        return True
    return _is_contract_final_month(contract, first)


def _is_contract_final_month(contract: Contract, first: date) -> bool:
    """Is ``first``'s month the contract's last one? Where untaken leave is cashed out."""
    end = contract.ending_date
    return end is not None and (end.year, end.month) == (first.year, first.month)


def _tenth_detail(rec: paid_leave_tenth.TenthReconciliation) -> dict[str, str]:
    """The « rappel de 1/10 » reconciliation as a stored dict, for the closing month.

    Mirrors :class:`TenthReconciliationSerializer` (decimals as strings, dates ISO) so
    the declaration can show the whole calculation — assiette, its tenth, the maintien
    already paid, the brut rappel and the net owed — rather than a bare figure.
    """
    return {
        "period_start": rec.period_start.isoformat(),
        "period_end": rec.period_end.isoformat(),
        "assiette_brut": str(rec.assiette_brut),
        "tenth_brut": str(rec.tenth_brut),
        "maintien_brut": str(rec.maintien_brut),
        "rappel_brut": str(rec.rappel_brut),
        "rappel_net": str(rec.rappel_net),
    }


def _apply(
    row: MonthlyDeclaration,
    result: declarations.FamilyResult,
    paid_leave_rappel: Decimal | None = None,
    paid_leave_tenth: dict[str, str] | None = None,
    paid_leave_compensatrice: Decimal | None = None,
) -> bool:
    """Copy a computed month onto its row. Snapshots the rates, not just the hours.

    ``paid_leave_rappel`` / ``paid_leave_tenth`` are the closing month's congés-payés
    top-up and the calculation behind it; ``paid_leave_compensatrice`` is the untaken-leave
    cash-out on the contract's final month (all None every other month, which is how a
    non-closing month reads apart from a reconciled zero).

    Returns whether anything actually changed, so an unchanged draft is left
    untouched rather than rewritten on every read.
    """
    values = {
        "paid_leave_rappel": paid_leave_rappel,
        "paid_leave_tenth": paid_leave_tenth,
        "paid_leave_compensatrice": paid_leave_compensatrice,
        "normal_hours": result.normal_hours,
        "hours_25": result.hours_25,
        "hours_50": result.hours_50,
        "net_salary": result.net_salary,
        "total_amount": result.total_amount,
        "transport_amount": result.transport_amount,
        "benefits_in_kind_amount": result.benefits_in_kind_amount,
        "kilometers": result.kilometers,
        "mileage_amount": result.mileage_amount,
        "night_count": result.night_count,
        "night_indemnity": result.night_indemnity,
        "holiday_majoration": result.holiday_majoration,
        "net_hourly_rate": result.net_hourly_rate,
        "night_presence_rate": result.night_presence_rate,
        "mileage_rate": result.mileage_rate,
        "rate_periods": list(result.rate_periods),
        "warnings": list(result.warnings),
    }
    # Decimal compares numerically, so a stored 174.00 equals a fresh 174 — a
    # rescale alone will not count as a change.
    changed = any(getattr(row, field) != value for field, value in values.items())
    for field, value in values.items():
        setattr(row, field, value)
    return changed


def file_declaration(row: MonthlyDeclaration, user) -> MonthlyDeclaration:
    """Record a declaration as sent. Idempotent; already-filed rows stand.

    Filing does not lock the row on its own — a filed declaration stays editable
    in place through its grace window (see MonthlyDeclaration). Re-filing an
    already-filed row would only re-stamp ``filed_at``, so it is a no-op.
    """
    if row.status == MonthlyDeclaration.Status.FILED:
        return row
    row.status = MonthlyDeclaration.Status.FILED
    row.filed_at = timezone.now()
    row.filed_by = user
    row.save(update_fields=["status", "filed_at", "filed_by"])
    return row


@dataclass(frozen=True, slots=True)
class SimulatedMonth:
    """One month of the payment simulation for a family: which month, and the
    breakdown of what it pays that month (see :mod:`contracts.simulation`)."""

    month: date
    breakdown: simulation.MonthlyPayBreakdown


def _months_in(start: date, end: date) -> list[date]:
    """First-of-month dates from ``start``'s month through ``end``'s, inclusive."""
    start = start.replace(day=1)
    return [
        declarations.first_of_month(start, offset)
        for offset in range(declarations.months_inclusive(start, end))
    ]


def _kilometers_by_month(contract: Contract, months: list[date]) -> dict[date, dict[UUID, Decimal]]:
    """Kilometres already entered per (month, family) across the window, in one query.

    Past months read the real kilométrage on their declarations, so the simulation
    prices their mileage as it actually stands; future months have no declaration and
    so no kilométrage to project (it reimburses distance actually driven).
    """
    out: dict[date, dict[UUID, Decimal]] = {}
    for row in MonthlyDeclaration.objects.filter(contract=contract, month__in=months):
        out.setdefault(row.month, {})[row.family_id] = row.kilometers
    return out


def simulate_range(
    contract: Contract, start_month: date, end_month: date
) -> dict[UUID, list[SimulatedMonth]]:
    """Each family's month-by-month payment across ``[start_month, end_month]``.

    The simulation behind the Home graph and the reference-period table: the whole
    window is loaded **once** (:func:`_load_contract_period`), then the pay engine runs
    for each month over the in-memory dataclasses — four families cost what one does,
    and twelve months a handful of queries rather than one load per month. Only the
    months the contract is actually live for are returned, per family, most-distant-
    first order preserved from the window.

    Prices each month exactly as :func:`declarations_for` would — future months from the
    schedule and terms in force, past months with their kilométrage on file — and, on a
    reference period's closing month (May, or the contract's final month), folds in the
    congés-payés « rappel de 1/10 » top-up so the graph and table show the year's real
    outlay, the annual settlement included.
    """
    months = _months_in(start_month, end_month)
    if not months:
        return {}

    period = _load_contract_period(contract, months[0], months[-1])
    if not period.family_ids:
        return {}

    start_first = contract.starting_date.replace(day=1)
    end_first = contract.ending_date.replace(day=1) if contract.ending_date else None

    km_by_month = _kilometers_by_month(contract, months)

    # The rappel is a whole-year reconciliation, so it is computed only for the window's
    # closing months (usually a single May) and read per family from there.
    rappel_by_month: dict[date, dict[UUID, Decimal]] = {}
    for month in months:
        if _closes_reference_period(contract, month) and (
            month >= start_first and (end_first is None or month <= end_first)
        ):
            rappel_by_month[month] = {
                family_id: rec.rappel_net
                for family_id, rec in tenth_reconciliation(contract, on=month).items()
            }

    out: dict[UUID, list[SimulatedMonth]] = {fid: [] for fid in period.family_ids}
    for month in months:
        # A month before the contract started, or after it ended, is paid nothing.
        if month < start_first or (end_first is not None and month > end_first):
            continue
        data = declarations.ContractMonth(
            month=month,
            starting_date=contract.starting_date,
            ending_date=contract.ending_date,
            split_method=contract.split_method,
            family_ids=period.family_ids,
            children=period.children,
            schedules=period.schedules,
            terms=period.terms,
            leaves=period.leaves,
            exceptional=period.exceptional,
            overrides=period.overrides,
            holidays=period.holidays,
            kilometers=km_by_month.get(month),
        )
        rappels = rappel_by_month.get(month, {})
        for family_id, result in declarations.compute_month(data).items():
            breakdown = simulation.breakdown_of(
                result, paid_leave_rappel=rappels.get(family_id, Decimal("0"))
            )
            # ``out`` already holds every family_id in period.family_ids, which is the
            # exact key set compute_month returns, so a plain index is safe.
            out[family_id].append(SimulatedMonth(month=month, breakdown=breakdown))
    return out


def group_windows_by_weekday(children: tuple[declarations.ChildPresence, ...]):
    """Windows keyed by weekday, per child.

    Not used by the loader — the domain reads the whole tuple, which is the point
    (a child with *no* window anywhere is present all day, a test that a
    per-weekday view cannot make). Kept as the shape any caller tempted to
    ``.filter(weekday=...)`` in a loop should build instead.
    """
    out: dict[UUID, defaultdict[int, list[declarations.Window]]] = {}
    for child in children:
        by_day: defaultdict[int, list[declarations.Window]] = defaultdict(list)
        for window in child.windows:
            by_day[window.weekday].append(window)
        out[child.child_id] = by_day
    return out
