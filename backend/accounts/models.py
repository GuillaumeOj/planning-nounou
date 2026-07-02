from typing import ClassVar

from django.contrib.auth.models import AbstractUser
from django.db import models

from .managers import UserManager


class User(AbstractUser):
    """Custom user that logs in with an email address instead of a username."""

    username = None  # type: ignore[assignment]
    email = models.EmailField("email address", unique=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    objects = UserManager()

    def __str__(self) -> str:
        return self.email


class Child(models.Model):
    """A child belonging to a parent user."""

    parent = models.ForeignKey(User, on_delete=models.CASCADE, related_name="children")
    first_name = models.CharField(max_length=150)

    def __str__(self) -> str:
        return self.first_name
