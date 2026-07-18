"""The only place the pay domain touches the database.

:mod:`tracking.declarations` is pure and knows nothing of Django; this module is
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
from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone

from . import declarations as dec
from . import paid_leave as pl
from .models import (
    BankHoliday,
    Contract,
    ContractChild,
    ContractSchedule,
    ContractTerms,
    ExceptionalHours,
    ExceptionalPresence,
    Leave,
    MonthlyDeclaration,
)

if TYPE_CHECKING:
    from datetime import date
    from decimal import Decimal
    from uuid import UUID


def load_contract_month(
    contract: Contract, month: date, *, kilometers: dict[UUID, Decimal] | None = None
) -> dec.ContractMonth:
    """One month of one contract, as the pure domain wants it."""
    first, last = dec.month_bounds(month)

    family_ids = tuple(
        share.family_id for share in contract.shares.all().order_by("added_at", "id")
    )

    schedules = tuple(
        dec.Schedule(
            effective_from=schedule.effective_from,
            blocks=tuple(
                dec.Block(weekday=b.weekday, start=b.start_time, end=b.end_time)
                for b in schedule.blocks.all()
            ),
        )
        # __lte, never __gte: the month's opening schedule is usually older than it.
        for schedule in ContractSchedule.objects.filter(contract=contract, effective_from__lte=last)
        .order_by("effective_from", "id")
        .prefetch_related("blocks")
    )

    terms = tuple(
        dec.Terms(
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
        dec.ChildPresence(
            child_id=link.child_id,
            family_id=link.child.family_id,
            # Grouped here, once. Filtering link.windows per weekday inside the
            # segmentation loop would re-query on every block of every day.
            windows=tuple(
                dec.Window(weekday=w.weekday, start=w.start_time, end=w.end_time)
                for w in link.windows.all()
            ),
        )
        for link in ContractChild.objects.filter(contract=contract)
        .select_related("child")
        .prefetch_related("windows")
    )

    leaves = tuple(
        dec.LeaveSpan(
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
        dec.ExceptionalEntry(
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
        dec.PresenceOverride(
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
        dec.Holiday(day=h.date, is_workable=h.is_workable, is_solidarity=h.is_solidarity)
        for h in BankHoliday.objects.filter(date__range=(first, last))
    )

    return dec.ContractMonth(
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


def paid_leave_balance(contract: Contract, on: date | None = None) -> pl.PaidLeaveBalance:
    """One contract's congés-payés balance for the reference period around ``on``.

    Loads only what the balance needs — the schedules (to know which days are
    worked), the paid leaves overlapping the period, and the non-workable holidays
    inside it — and hands them to the pure :mod:`tracking.paid_leave` domain.
    """
    on = on or timezone.localdate()
    period_start, period_end = pl.reference_period(on)

    schedules = tuple(
        dec.Schedule(
            effective_from=schedule.effective_from,
            blocks=tuple(
                dec.Block(weekday=b.weekday, start=b.start_time, end=b.end_time)
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
        dec.LeaveSpan(
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
        dec.Holiday(day=h.date, is_workable=h.is_workable, is_solidarity=h.is_solidarity)
        for h in BankHoliday.objects.filter(date__range=(period_start, period_end))
    )

    return pl.compute_balance(
        paid_leave_days=contract.paid_leave_days,
        contract_start=contract.starting_date,
        contract_end=contract.ending_date,
        schedules=schedules,
        leaves=leaves,
        holidays=holidays,
        on=on,
    )


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
    first, _ = dec.month_bounds(month)
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
    results = dec.compute_month(data)

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
        changed = _apply(row, result)
        # A new row must be written; an existing one only when its numbers actually
        # moved. Merely opening the home dashboard reads several months across every
        # contract, and each read recomputes; without this it would also rewrite
        # every unchanged draft (and bump its computed_at) on every load.
        if is_new or changed:
            row.save()
        rows.append(row)
    return rows


def _apply(row: MonthlyDeclaration, result: dec.FamilyResult) -> bool:
    """Copy a computed month onto its row. Snapshots the rates, not just the hours.

    Returns whether anything actually changed, so an unchanged draft is left
    untouched rather than rewritten on every read.
    """
    values = {
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


def group_windows_by_weekday(children: tuple[dec.ChildPresence, ...]):
    """Windows keyed by weekday, per child.

    Not used by the loader — the domain reads the whole tuple, which is the point
    (a child with *no* window anywhere is present all day, a test that a
    per-weekday view cannot make). Kept as the shape any caller tempted to
    ``.filter(weekday=...)`` in a loop should build instead.
    """
    out: dict[UUID, defaultdict[int, list[dec.Window]]] = {}
    for child in children:
        by_day: defaultdict[int, list[dec.Window]] = defaultdict(list)
        for window in child.windows:
            by_day[window.weekday].append(window)
        out[child.child_id] = by_day
    return out
