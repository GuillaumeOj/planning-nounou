"""The Contract aggregate.

Split into focused modules for readability; every model is re-exported here so
``from contracts.models import Contract`` (and friends) keeps working.
"""

from ._common import NON_NEGATIVE, current_snapshot
from .contract import Contract, ContractInvitation, ContractQuerySet, ContractShare
from .coverage import ContractChild, ContractChildWindow
from .declaration import MonthlyDeclaration
from .exceptional import ExceptionalHours, ExceptionalPresence
from .leave import Leave
from .schedule import ContractSchedule, ScheduleBlock
from .terms import ContractTerms

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
