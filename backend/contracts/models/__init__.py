"""The Contract aggregate.

Split into focused modules for readability; every model is re-exported here so
``from contracts.models import Contract`` (and friends) keeps working.
"""

from contracts.models._common import NON_NEGATIVE, current_snapshot
from contracts.models.contract import Contract, ContractInvitation, ContractQuerySet, ContractShare
from contracts.models.coverage import ContractChild, ContractChildWindow
from contracts.models.declaration import MonthlyDeclaration
from contracts.models.exceptional import ExceptionalHours, ExceptionalPresence
from contracts.models.leave import Leave
from contracts.models.schedule import ContractSchedule, ScheduleBlock
from contracts.models.terms import ContractTerms

__all__ = [
    "NON_NEGATIVE",
    "Contract",
    "ContractChild",
    "ContractChildWindow",
    "ContractInvitation",
    "ContractQuerySet",
    "ContractSchedule",
    "ContractShare",
    "ContractTerms",
    "ExceptionalHours",
    "ExceptionalPresence",
    "Leave",
    "MonthlyDeclaration",
    "ScheduleBlock",
    "current_snapshot",
]
