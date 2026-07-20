"""Shared building blocks for the contracts model package."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.core.validators import MinValueValidator

#: Reused validator list for every money/hours field on the contract aggregate.
NON_NEGATIVE = [MinValueValidator(Decimal("0"))]


def current_snapshot(queryset, on: date):
    """Latest effective-dated snapshot in `queryset` in force on `on`, or None.

    Shared by :class:`Contract`'s current-terms/current-schedule accessors — both
    are effective-dated snapshots keyed on ``(contract, effective_from)``.
    """
    return queryset.filter(effective_from__lte=on).order_by("-effective_from", "-id").first()
