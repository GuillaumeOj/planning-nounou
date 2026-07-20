from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, ClassVar

from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _

from config.models import UUIDModel

from .contract import Contract
from .schedule import ScheduleBlock

if TYPE_CHECKING:
    from django.db.models.fields.related_descriptors import RelatedManager


class ContractChild(UUIDModel):
    """A child covered by a contract. The through model for `Contract.children`.

    Flat, not effective-dated: versioning presence would need a third snapshot
    level (set → child → window) inheriting the delete-and-recreate churn of
    ContractSchedule, for a shape whose UI is not settled yet. Safe only because
    a filed MonthlyDeclaration freezes its own numbers — see that model. Adding
    an ``effective_from`` later is a one-column migration backfilled to
    ``contract.starting_date``; the reverse would not be.
    """

    contract = models.ForeignKey(
        Contract, on_delete=models.CASCADE, related_name="contract_children"
    )
    child = models.ForeignKey(
        "children.Child", on_delete=models.CASCADE, related_name="contract_children"
    )

    if TYPE_CHECKING:
        contract_id: uuid.UUID
        child_id: uuid.UUID
        windows: RelatedManager[ContractChildWindow]

    class Meta:
        constraints: ClassVar[list] = [
            models.UniqueConstraint(fields=["contract", "child"], name="uniq_contract_child"),
        ]

    def __str__(self) -> str:
        return f"{self.child} on {self.contract}"

    def clean(self) -> None:
        # Nothing else stops attaching a child of a family that has no share in
        # the contract, and the damage is double: their hours would be routed to
        # a family that never employed the nanny, and the child's name would
        # surface in that family's declaration.
        if self.contract_id and self.child_id:
            family_id = self.child.family_id
            if not self.contract.shares.filter(family_id=family_id).exists():
                raise ValidationError(
                    {"child": _("This child's family does not share this contract.")}
                )


class ContractChildWindow(UUIDModel):
    """The hours of one weekday a :class:`ContractChild` is actually present.

    Optional, and the absence of any window is meaningful: a child with **no
    windows at all** is present whenever the nanny works, which is the common
    case. A child with *any* window is present only within the union of them —
    a test evaluated across every weekday, never within one. A child windowed
    Mon/Tue/Thu/Fri has no Wednesday window and is therefore absent on
    Wednesday; reading "no window *for this weekday*" as "present all day" would
    say the exact opposite.
    """

    contract_child = models.ForeignKey(
        ContractChild, on_delete=models.CASCADE, related_name="windows"
    )
    weekday = models.IntegerField(choices=ScheduleBlock.Weekday.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering: ClassVar[list[str]] = ["weekday", "start_time"]

    def __str__(self) -> str:
        return f"{self.get_weekday_display()} {self.start_time}–{self.end_time}"  # ty: ignore[unresolved-attribute]

    def clean(self) -> None:
        # Overlapping windows for one child are deliberately allowed: their union
        # is what counts, and the segmentation cuts on every boundary anyway.
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValidationError({"end_time": _("The end time must be after the start time.")})
