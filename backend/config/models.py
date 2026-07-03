"""Shared model base classes.

`DEFAULT_AUTO_FIELD` can't express a UUID primary key — Django requires it to
name an ``AutoField`` subclass, and ``UUIDField`` isn't one. So the project-wide
default of "every model's PK is a random UUID-4" is carried by this abstract
base instead: models inherit :class:`UUIDModel` and get a non-sequential,
non-guessable primary key with no extra per-model boilerplate.
"""

from __future__ import annotations

import uuid

from django.db import models


class UUIDModel(models.Model):
    """Abstract base giving every concrete model a UUID-4 primary key.

    The ``id`` is generated in Python at instantiation (``default=uuid.uuid4``)
    rather than by the database, so a new instance knows its own id before it is
    saved. It's ``editable=False`` so it never surfaces in forms/admin as writable.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True
