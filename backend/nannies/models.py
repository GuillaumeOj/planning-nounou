from __future__ import annotations

from typing import TYPE_CHECKING, ClassVar

from django.conf import settings
from django.db import models

from config.models import UUIDModel

if TYPE_CHECKING:
    from django.db.models.fields.related_descriptors import RelatedManager

    from contracts.models import Contract


class Nanny(UUIDModel):
    """A childcare person ("garde d'enfants à domicile").

    Identity only. The employment relationship and its terms live on
    :class:`contracts.Contract`; a nanny may be shared by several families
    through one contract (see :class:`contracts.ContractShare`).
    """

    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    # Provenance, mirroring Family.created_by; a nanny is not *owned* by a user.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="nannies_created",
    )

    if TYPE_CHECKING:
        contracts: RelatedManager[Contract]

    class Meta:
        ordering: ClassVar[list[str]] = ["last_name", "first_name"]
        verbose_name_plural = "nannies"

    def __str__(self) -> str:
        return f"{self.first_name} {self.last_name}"
