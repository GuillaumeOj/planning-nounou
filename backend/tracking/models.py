from typing import ClassVar

from django.conf import settings
from django.db import models


class Nanny(models.Model):
    """A nanny employed by a user, tracked over an optionally open-ended period."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="nannies",
    )
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    starting_date = models.DateField()
    ending_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering: ClassVar[list[str]] = ["-starting_date"]

    def __str__(self) -> str:
        return f"{self.first_name} {self.last_name}"
