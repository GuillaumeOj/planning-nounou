from __future__ import annotations

from django.db import models

from config.models import UUIDModel


class Child(UUIDModel):
    """A child belonging to a family."""

    family = models.ForeignKey("accounts.Family", on_delete=models.CASCADE, related_name="children")
    first_name = models.CharField(max_length=150)

    def __str__(self) -> str:
        return self.first_name
