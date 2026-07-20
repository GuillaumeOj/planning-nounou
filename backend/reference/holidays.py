"""French national bank holidays (jours fériés) computation.

Pure, dependency-free domain logic kept out of the management command so it can
be reused (e.g. a future admin action or API) without importing a command.
"""

from __future__ import annotations

from datetime import date, timedelta


def easter_sunday(year: int) -> date:
    """Easter Sunday for ``year`` (Gregorian) via the anonymous computus algorithm."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    m = (32 + 2 * e + 2 * i - h - k) % 7
    n = (a + 11 * h + 22 * m) // 451
    month = (h + m - 7 * n + 114) // 31
    day = ((h + m - 7 * n + 114) % 31) + 1
    return date(year, month, day)


def french_bank_holidays(year: int) -> list[tuple[str, date]]:
    """The 11 metropolitan-France jours fériés for ``year`` as ``(name, date)``."""
    easter = easter_sunday(year)
    return [
        ("Jour de l'An", date(year, 1, 1)),
        ("Lundi de Pâques", easter + timedelta(days=1)),
        ("Fête du Travail", date(year, 5, 1)),
        ("Victoire 1945", date(year, 5, 8)),
        ("Ascension", easter + timedelta(days=39)),
        ("Lundi de Pentecôte", easter + timedelta(days=50)),
        ("Fête Nationale", date(year, 7, 14)),
        ("Assomption", date(year, 8, 15)),
        ("Toussaint", date(year, 11, 1)),
        ("Armistice 1918", date(year, 11, 11)),
        ("Noël", date(year, 12, 25)),
    ]
