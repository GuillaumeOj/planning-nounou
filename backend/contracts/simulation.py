"""What a family will pay a nanny, month by month — the payment *simulation*.

Pure, Django-free domain logic, like :mod:`contracts.declarations`,
:mod:`contracts.paid_leave` and :mod:`contracts.paid_leave_tenth`. The ORM
boundary is :mod:`contracts.declarations_repo`, which runs the pay engine over a
run of months and hands each month's :class:`~contracts.declarations.FamilyResult`
here to be folded into the amount a family actually disburses.

**What "paid" means here.** The graph on Home and the reference-period table both
answer one question — *how much does this family pay, this month?* — so the figure
is the whole cash outlay, not pajemploi's "salaire net":

* the net wage (:attr:`FamilyResult.total_amount`: banded hours, night presence and
  worked-holiday majoration),
* the transport reimbursement and the kilométrage,
* the value of the benefits in kind, and
* on a reference period's closing month, the congés-payés « rappel de 1/10 » top-up
  (:mod:`contracts.paid_leave_tenth`), which is paid on top of every ordinary month.

It is a *simulation*: future months carry no filed declaration, so they are priced
from the schedule and terms in force exactly as a real month would be. Past months
inside the window reflect what is on file (leaves booked, exceptional hours, the
kilométrage entered), so the table reads as the year actually stands, projected
forward from today.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from contracts.declarations import FamilyResult

ZERO = Decimal("0")


@dataclass(frozen=True, slots=True)
class MonthlyPayBreakdown:
    """One family-month's payment, split the way the detail table shows it.

    Every component the family disburses that month, each its own column, and
    :attr:`total` — their sum — the figure the graph plots and the table foots.
    ``paid_leave_rappel`` is the congés-payés 1/10 top-up and is zero every month
    but a reference period's close, where the year's shortfall (if any) falls due.
    """

    net_wage: Decimal
    transport: Decimal
    mileage: Decimal
    benefits_in_kind: Decimal
    paid_leave_rappel: Decimal

    @property
    def total(self) -> Decimal:
        return (
            self.net_wage
            + self.transport
            + self.mileage
            + self.benefits_in_kind
            + self.paid_leave_rappel
        )


def breakdown_of(result: FamilyResult, *, paid_leave_rappel: Decimal = ZERO) -> MonthlyPayBreakdown:
    """Fold one family's monthly pay result into what it pays out.

    The net wage carries the majorations already; transport and kilométrage are the
    frais reimbursed; benefits in kind their declared value. ``paid_leave_rappel`` is
    passed in (zero unless this month settles a reference period) rather than read from
    the result, because the rappel is a whole-year reconciliation the month itself does
    not know about.
    """
    return MonthlyPayBreakdown(
        net_wage=result.total_amount,
        transport=result.transport_amount,
        mileage=result.mileage_amount,
        benefits_in_kind=result.benefits_in_kind_amount,
        paid_leave_rappel=paid_leave_rappel,
    )
