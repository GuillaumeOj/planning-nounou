from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING, ClassVar

from django.conf import settings
from django.db import models
from django.utils import timezone

from config.models import UUIDModel

from ._common import NON_NEGATIVE
from .contract import Contract


class ContractTerms(UUIDModel):
    """An effective-dated compensation snapshot ("avenant").

    Editing terms creates a NEW row with a new ``effective_from`` rather than
    mutating the previous one, preserving the full history. Current terms are the
    latest row with ``effective_from <= today`` (see Contract.current_terms).
    """

    contract = models.ForeignKey(Contract, on_delete=models.CASCADE, related_name="terms")
    effective_from = models.DateField(default=timezone.localdate)

    net_hourly_rate = models.DecimalField(max_digits=6, decimal_places=2, validators=NON_NEGATIVE)
    # Hourly rate for "présence de nuit" (20:00–06:30), which URSSAF pays as a
    # flat indemnity rather than as worked hours. The parties agree the amount;
    # URSSAF only sets a floor of a quarter of net_hourly_rate, which the API
    # surfaces as a soft warning (like MinimumWage) rather than enforcing.
    night_presence_rate = models.DecimalField(
        max_digits=6, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )
    transport_fee = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )
    mileage_rate = models.DecimalField(
        max_digits=5, decimal_places=3, default=Decimal("0"), validators=NON_NEGATIVE
    )
    benefits_in_kind = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal("0"), validators=NON_NEGATIVE
    )
    # Set when this snapshot was corrected in place (vs. a fresh dated version),
    # so the UI can flag the current state as "edited".
    edited = models.BooleanField(default=False)
    # Who last wrote this snapshot — the history shows it so a family can see at a
    # glance who changed the pay. SET_NULL: the record of the change outlives the
    # account that made it.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contract_terms_created",
    )

    if TYPE_CHECKING:
        contract_id: uuid.UUID

    class Meta:
        ordering: ClassVar[list[str]] = ["-effective_from", "-id"]
        verbose_name_plural = "contract terms"
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["contract", "effective_from"], name="uniq_terms_per_effective_date"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.contract} terms from {self.effective_from}"
