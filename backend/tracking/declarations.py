"""What each family declares to pajemploi for one month.

Pure, dependency-free domain logic kept out of the models and the views so it can
be reused and, above all, tested without a database. Nothing here imports Django.
The ORM boundary is :mod:`tracking.declarations_repo`, which loads a month into
the frozen dataclasses below and hands them over; every function here is a
function of its arguments alone.

The rules and their sources are in ``docs/shared-care-pay.md``. Four things in
here look wrong and are not:

* **A bank holiday deducts nothing.** Mensualisation is a fixed × 52 ÷ 12
  precisely so that the shape of a calendar month does not matter. May has more
  jours fériés than March and the salary is identical. The planning hides working
  blocks on a holiday; pay must not.
* **Paid leave deducts nothing.** 52 weeks = 47 worked + 5 of paid leave, so the
  leave is already inside the base. Only ``UNPAID`` deducts. "She was off all
  week and got paid the same" is the design working.
* **The week is banded before it is split.** Splitting a 45h week 30/15 leaves
  both families under the 40h threshold and the majoration silently disappears.
  The nanny worked 45h; band her week, then split each band. The ruling lives in
  :func:`band_week` alone.
* **Time is naive and local.** The project runs ``TIME_ZONE="UTC"`` with
  ``USE_TZ=True``. An aware 20:00 Paris persists as 18:00Z in summer, so a
  night-presence test would be wrong twice a year and a 00:30 entry would be
  declared in the wrong month. Never let an aware datetime in here.

Arithmetic is exact until the last step: integer minutes and :class:`Fraction`
weights throughout, rounded once at the end by :func:`apportion`, which
guarantees the parts sum to the whole. Floats do not: 10h split three ways is
3.33 × 3 = 9.99, and the missing 0.01 is the nanny's.
"""

from __future__ import annotations

import calendar
import math
from collections import defaultdict
from dataclasses import dataclass, replace
from datetime import date, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping, Sequence

# --- the rules ---------------------------------------------------------------
# URSSAF, "garde d'enfants à domicile". See docs/shared-care-pay.md §1.

#: Durée hebdomadaire conventionnelle: hours beyond this are heures supplémentaires.
WEEKLY_NORMAL_MINUTES = 40 * 60
#: The first 8 overtime hours take +25%; anything past them takes +50%.
WEEKLY_BAND_25_MINUTES = 8 * 60
MAJORATION_25 = Decimal("1.25")
MAJORATION_50 = Decimal("1.50")

#: An hour of "présence responsable" is two thirds of an hour of effective work.
#: Exact on purpose — Decimal("0.667") leaks a third of a cent per hour.
PRESENCE_RESPONSABLE_RATIO = Fraction(2, 3)

#: "Présence de nuit" runs 20:00–06:30. It is paid as an indemnity rather than as
#: worked hours — it does not count toward the 40h week — but it is priced BY THE
#: HOUR, not as a fixed sum per night. Art. 137.2 leaves no room: every tier is a
#: fraction "du salaire contractuel versé pour une durée de travail effectif
#: ÉQUIVALENTE", i.e. of what those same hours of real work would have paid.
#: "Forfaitaire" means "not working time", not "flat".
NIGHT_PRESENCE_START = time(20, 0)
NIGHT_PRESENCE_END = time(6, 30)
NIGHT_PRESENCE_MAX_MINUTES = 12 * 60

#: The floor for an undisturbed night: a quarter of the equivalent salary.
NIGHT_INDEMNITY_FLOOR_RATIO = Fraction(1, 4)
#: From the SECOND intervention the indemnity "est portée à" a third — an
#: obligation, not a floor. A nanny up twice is owed a third more.
NIGHT_INDEMNITY_DISTURBED_RATIO = Fraction(1, 3)
NIGHT_INTERVENTIONS_DISTURBED = 2
#: At four, the interventions themselves are paid as full effective work, and if
#: EVERY night reaches four the presence is requalified outright. Neither is
#: computable from a bare count — the interventions' durations are not recorded —
#: so both raise a warning rather than a wrong number.
NIGHT_INTERVENTIONS_FULL_RATE = 4

#: A *worked* jour férié ordinaire: art. 47.2 owes 10% on the hours done.
#: A chômé one owes nothing extra — it is already inside the mensualised base.
ORDINARY_HOLIDAY_MAJORATION = Decimal("0.10")
#: Art. 47.1: a worked 1 May is owed 100% on top. The only date with its own rule.
MAY_FIRST_MAJORATION = Decimal("1.00")
MAY_FIRST = (5, 1)

MONTHS_PER_YEAR = 12
#: art. 146.1 mensualises a regular week on x 52, flat: 47 worked weeks + 5 of
#: paid leave. Not a variable — an *irregular* schedule is not mensualised at all
#: (art. 146.2, paid on the hours actually worked), which is a mode this module
#: does not implement rather than a different week count.
WEEKS_PER_YEAR = 52

#: Only unpaid leave deducts; paid leave is already inside the mensualised base.
DEDUCTING_LEAVE_TYPES = frozenset({"unpaid"})

HOUR_QUANTUM = Decimal("0.01")
MONEY_QUANTUM = Decimal("0.01")

MINUTES_PER_HOUR = 60
BAND_NORMAL, BAND_25, BAND_50 = 0, 1, 2


# --- the ORM boundary --------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Interval:
    """A span of one day, naive local."""

    start: time
    end: time


@dataclass(frozen=True, slots=True)
class Window:
    """The hours of one weekday a child is present."""

    weekday: int
    start: time
    end: time


@dataclass(frozen=True, slots=True)
class ChildPresence:
    """A child on the contract, and when they are there.

    ``windows`` empty means present whenever the nanny works — the common case,
    and the default. Note this test is on the whole tuple, never on the subset
    matching one weekday: a child windowed Mon/Tue/Thu/Fri is *absent* on
    Wednesday, and asking "are there windows for Wednesday?" would conclude the
    opposite.
    """

    child_id: UUID
    family_id: UUID
    windows: tuple[Window, ...] = ()


@dataclass(frozen=True, slots=True)
class Block:
    """One time block of a weekly schedule."""

    weekday: int
    start: time
    end: time


@dataclass(frozen=True, slots=True)
class Schedule:
    """The nanny's week, shared by every family on the contract."""

    effective_from: date
    blocks: tuple[Block, ...]


@dataclass(frozen=True, slots=True)
class Terms:
    effective_from: date
    net_hourly_rate: Decimal
    night_presence_rate: Decimal = Decimal("0")
    transport_fee: Decimal = Decimal("0")
    mileage_rate: Decimal = Decimal("0")
    benefits_in_kind: Decimal = Decimal("0")


@dataclass(frozen=True, slots=True)
class LeaveSpan:
    leave_type: str
    start_date: date
    end_date: date
    portion: str
    hours: Decimal | None = None


@dataclass(frozen=True, slots=True)
class ExceptionalEntry:
    """Hours beyond the schedule, filed by one family."""

    family_id: UUID
    kind: str
    start_date: date
    start_time: time
    end_date: date
    end_time: time
    #: Times the nanny was woken. Prices the night; see night_indemnity_ratio.
    interventions: int = 0


@dataclass(frozen=True, slots=True)
class Holiday:
    """A jour férié, and whether the nanny worked it."""

    day: date
    is_workable: bool = False
    #: Worked, but owed rather than bought — no majoration. See BankHoliday.
    is_solidarity: bool = False


@dataclass(frozen=True, slots=True)
class PresenceOverride:
    """A child present on one date outside their usual window."""

    child_id: UUID
    day: date
    start: time
    end: time


@dataclass(frozen=True, slots=True)
class Segment:
    """A stretch of a block over which the set of children present does not change."""

    weekday: int
    start: time
    end: time
    present: frozenset[UUID]
    minutes: int


@dataclass(frozen=True, slots=True)
class Bands:
    """Minutes (or mensualised minutes) in each majoration band."""

    normal: Fraction = Fraction(0)
    at_25: Fraction = Fraction(0)
    at_50: Fraction = Fraction(0)

    def __add__(self, other: Bands) -> Bands:
        return Bands(self.normal + other.normal, self.at_25 + other.at_25, self.at_50 + other.at_50)

    def __sub__(self, other: Bands) -> Bands:
        return Bands(self.normal - other.normal, self.at_25 - other.at_25, self.at_50 - other.at_50)

    def scaled(self, factor: Fraction) -> Bands:
        return Bands(self.normal * factor, self.at_25 * factor, self.at_50 * factor)

    def clamped(self) -> Bands:
        """Floor every band at zero.

        Nothing should reach here negative now that absence is a ratio rather than
        a subtraction (see attendance_ratio) — a ratio cannot overshoot. It stays
        as a backstop for the exceptional path, which adds rather than subtracts.
        Note it clamps each band independently, so it cannot be used to absorb a
        deduction across bands; if a caller ever needs that, it needs a different
        function, not this one with a wider remit.
        """
        zero = Fraction(0)
        return Bands(max(zero, self.normal), max(zero, self.at_25), max(zero, self.at_50))

    @property
    def total(self) -> Fraction:
        return self.normal + self.at_25 + self.at_50


@dataclass(frozen=True, slots=True)
class WeekBands:
    """A banded week, per family, kept both whole and per weekday.

    ``by_weekday`` is what makes an unpaid leave computable: "which band does a
    missed Monday come off?" is already answered by construction, including the
    case where a Friday sits astride the 40h line.
    """

    total: Mapping[UUID, Bands]
    by_weekday: Mapping[int, Mapping[UUID, Bands]]
    #: Minutes the nanny works each weekday, all families together.
    minutes_by_weekday: Mapping[int, int]

    @property
    def weekly_minutes(self) -> int:
        return sum(self.minutes_by_weekday.values())


@dataclass(frozen=True, slots=True)
class SubPeriod:
    """A stretch of the month over which one schedule and one terms are in force."""

    start: date
    end: date
    days: int
    #: This stretch's share of the calendar month. The weights of a whole month
    #: sum to exactly 1, so a mid-month avenant moves the price, never the hours.
    weight: Fraction
    schedule: Schedule | None
    terms: Terms | None


@dataclass(frozen=True, slots=True)
class ContractMonth:
    """Everything one month of one contract depends on. Built by the repo layer."""

    month: date
    starting_date: date
    ending_date: date | None
    split_method: str
    family_ids: tuple[UUID, ...]
    children: tuple[ChildPresence, ...]
    schedules: tuple[Schedule, ...]
    terms: tuple[Terms, ...]
    leaves: tuple[LeaveSpan, ...] = ()
    exceptional: tuple[ExceptionalEntry, ...] = ()
    overrides: tuple[PresenceOverride, ...] = ()
    holidays: tuple[Holiday, ...] = ()
    kilometers: Mapping[UUID, Decimal] | None = None


@dataclass(frozen=True, slots=True)
class FamilyResult:
    family_id: UUID
    normal_hours: Decimal
    hours_25: Decimal
    hours_50: Decimal
    night_count: int
    night_indemnity: Decimal
    holiday_majoration: Decimal
    transport_amount: Decimal
    benefits_in_kind_amount: Decimal
    kilometers: Decimal
    mileage_amount: Decimal
    total_amount: Decimal
    net_hourly_rate: Decimal
    night_presence_rate: Decimal
    mileage_rate: Decimal
    rate_periods: tuple[dict, ...]
    warnings: tuple[str, ...]


# --- time --------------------------------------------------------------------


def minutes_of(value: time) -> int:
    return value.hour * MINUTES_PER_HOUR + value.minute


def minutes_between(start: time, end: time) -> int:
    """Minutes from `start` to `end` within one day. Never negative."""
    return max(0, minutes_of(end) - minutes_of(start))


def to_hours(minutes: Fraction) -> Decimal:
    """Exact minutes to a rounded hour count. Round once, at the very end."""
    return _quantize(Decimal(minutes.numerator) / Decimal(minutes.denominator) / MINUTES_PER_HOUR)


def _quantize(value: Decimal, quantum: Decimal = HOUR_QUANTUM) -> Decimal:
    return value.quantize(quantum, rounding=ROUND_HALF_UP)


def month_bounds(month: date) -> tuple[date, date]:
    first = month.replace(day=1)
    last = first.replace(day=calendar.monthrange(first.year, first.month)[1])
    return first, last


def days_between(start: date, end: date) -> Iterable[date]:
    day = start
    while day <= end:
        yield day
        day += timedelta(days=1)


def merge_intervals(intervals: Sequence[Interval]) -> tuple[Interval, ...]:
    """Union of possibly overlapping intervals, in order."""
    if not intervals:
        return ()
    ordered = sorted(intervals, key=lambda i: (i.start, i.end))
    merged = [ordered[0]]
    for current in ordered[1:]:
        last = merged[-1]
        if current.start <= last.end:
            if current.end > last.end:
                merged[-1] = Interval(last.start, current.end)
        else:
            merged.append(current)
    return tuple(merged)


# --- presence ----------------------------------------------------------------


def presence_on(
    child: ChildPresence, day: date, overrides: Sequence[PresenceOverride] = ()
) -> tuple[Interval, ...] | None:
    """When `child` is there on `day`. ``None`` means "whenever the nanny works".

    A child with no windows at all is always present, and an override adds
    nothing to that. Otherwise presence is the union of that weekday's windows
    with any override *for this date* — an override adds presence, it does not
    replace the regular week.

    Note the override is matched on the date as well as the child. Matching the
    child alone reads identically and is wrong in a way nothing would notice: a
    one-off Monday would silently repeat on every Monday of the month.
    """
    if not child.windows:
        return None
    intervals = [Interval(w.start, w.end) for w in child.windows if w.weekday == day.weekday()]
    intervals += [
        Interval(o.start, o.end) for o in overrides if o.child_id == child.child_id and o.day == day
    ]
    return merge_intervals(intervals)


def covers(intervals: tuple[Interval, ...] | None, start: time, end: time) -> bool:
    """Is [start, end] wholly inside `intervals`?

    Whole-segment containment, not an instant: segments are cut at every
    boundary, so a segment is either entirely inside a window or entirely
    outside it, and testing the start alone would keep a segment a window only
    partly covers.
    """
    if intervals is None:
        return True
    return any(i.start <= start and end <= i.end for i in intervals)


def cut_points(block: Block, presences: Mapping[UUID, tuple[Interval, ...] | None]) -> list[time]:
    """Every instant inside `block` where the set of children present can change."""
    points = {block.start, block.end}
    for intervals in presences.values():
        if intervals is None:
            continue
        for interval in intervals:
            # Strictly inside: a window reaching past the block would otherwise
            # cut a phantom segment beyond the nanny's day.
            for edge in (interval.start, interval.end):
                if block.start < edge < block.end:
                    points.add(edge)
    return sorted(points)


def segment_block(
    block: Block, presences: Mapping[UUID, tuple[Interval, ...] | None]
) -> list[Segment]:
    """Cut `block` wherever the present-child set changes."""
    points = cut_points(block, presences)
    segments: list[Segment] = []
    for start, end in zip(points, points[1:], strict=False):
        present = frozenset(
            child_id for child_id, intervals in presences.items() if covers(intervals, start, end)
        )
        segments.append(
            Segment(
                weekday=block.weekday,
                start=start,
                end=end,
                present=present,
                minutes=minutes_between(start, end),
            )
        )
    return _merge_adjacent(segments)


def _merge_adjacent(segments: list[Segment]) -> list[Segment]:
    """Fuse neighbours with the same present-set, so the output is canonical.

    Overlapping windows on one child produce adjacent segments with identical
    present-sets; harmless arithmetically, but they make the result depend on how
    the windows were typed rather than on what they mean.
    """
    merged: list[Segment] = []
    for segment in segments:
        if merged and merged[-1].present == segment.present and merged[-1].end == segment.start:
            previous = merged[-1]
            merged[-1] = replace(
                previous, end=segment.end, minutes=previous.minutes + segment.minutes
            )
        else:
            merged.append(segment)
    return merged


def segment_weights(
    present: frozenset[UUID],
    children: Mapping[UUID, ChildPresence],
    split_method: str,
    family_ids: Sequence[UUID],
) -> dict[UUID, Fraction]:
    """Each family's share of a segment. Sums to exactly 1, always.

    With no child present the weights would all be zero. Dropping the segment
    would break the sum invariant and underpay the nanny, so it falls back to an
    equal split over every family on the contract. That is not a defensive
    branch: a contract with no children listed takes it for *every* segment,
    which is what keeps this feature additive for contracts that predate it —
    equal when shared, 100% when solo, i.e. the status quo.

    A child whose family has no share in the contract counts for nobody. It
    should not exist — ContractChild.clean rejects it — but `clean` does not run
    on `.create()`, and the alternative to ignoring it here is worse: it would
    take a share of the segment and then be dropped from the result, quietly
    deleting minutes the nanny worked. Ignoring it routes those minutes to the
    families that *are* on the contract, which is the answer the invariant needs.
    """
    on_contract = set(family_ids)
    counts: defaultdict[UUID, int] = defaultdict(int)
    for child_id in present:
        child = children.get(child_id)
        if child is not None and child.family_id in on_contract:
            counts[child.family_id] += 1

    if not counts:
        share = Fraction(1, len(family_ids)) if family_ids else Fraction(0)
        return {family_id: share for family_id in family_ids}

    if split_method == "equal":
        # One share per family *present*, not per family on the contract: the
        # latter hands a family half of a day its child never attended.
        weights = {family_id: Fraction(1) for family_id in counts}
    else:
        weights = {family_id: Fraction(count) for family_id, count in counts.items()}

    total = sum(weights.values())
    shares = {family_id: weight / total for family_id, weight in weights.items()}
    return {family_id: shares.get(family_id, Fraction(0)) for family_id in family_ids}


# --- banding -----------------------------------------------------------------


def _band_at(position):
    """The band a minute at `position` in the week falls in, and its room left.

    Numeric-agnostic on purpose: an int position gives an int room, a Fraction
    position gives a Fraction one. See allocate_bands.
    """
    if position < WEEKLY_NORMAL_MINUTES:
        return BAND_NORMAL, WEEKLY_NORMAL_MINUTES - position
    limit = WEEKLY_NORMAL_MINUTES + WEEKLY_BAND_25_MINUTES
    if position < limit:
        return BAND_25, limit - position
    return BAND_50, None


def _add_band(bands: Bands, band: int, minutes: Fraction) -> Bands:
    if band == BAND_NORMAL:
        return Bands(bands.normal + minutes, bands.at_25, bands.at_50)
    if band == BAND_25:
        return Bands(bands.normal, bands.at_25 + minutes, bands.at_50)
    return Bands(bands.normal, bands.at_25, bands.at_50 + minutes)


def allocate_bands(start_position, minutes):
    """Split `minutes` starting at `start_position` in the week into (band, minutes).

    Works on ints and Fractions alike, and must: présence responsable converts at
    two thirds, so a week's exceptional minutes are rarely whole. Truncating the
    position to an int — as a separate "exact" variant of this function once did —
    puts a whole minute in the band below whenever the position lands mid-minute
    on a threshold, quietly defeating the exact arithmetic this module rests on.
    """
    out = []
    position, left = start_position, minutes
    while left > 0:
        band, room = _band_at(position)
        take = left if room is None else min(left, room)
        out.append((band, take))
        position += take
        left -= take
    return out


def week_segments(
    schedule: Schedule,
    children: Mapping[UUID, ChildPresence],
    split_method: str,
    family_ids: Sequence[UUID],
    day: date | None = None,
    overrides: Sequence[PresenceOverride] = (),
) -> list[tuple[Segment, dict[UUID, Fraction]]]:
    """Every segment of the schedule's week, in order, with its family shares.

    `day` anchors the week to a real date so that a :class:`PresenceOverride` can
    be matched against it. Without one the week is the regular template and the
    weekday alone decides presence — which is what the mensualised base wants,
    since a base built from one month's exceptions would not be a base.
    """
    out: list[tuple[Segment, dict[UUID, Fraction]]] = []
    for block in sorted(schedule.blocks, key=lambda b: (b.weekday, b.start)):
        if day is None:
            # A Monday, for its weekday only; no override can match it.
            block_day = date(2024, 1, 1) + timedelta(days=block.weekday)
            block_overrides: Sequence[PresenceOverride] = ()
        else:
            block_day = day + timedelta(days=block.weekday - day.weekday())
            block_overrides = overrides
        presences = {
            child_id: presence_on(child, block_day, block_overrides)
            for child_id, child in children.items()
        }
        for segment in segment_block(block, presences):
            out.append(
                (segment, segment_weights(segment.present, children, split_method, family_ids))
            )
    return out


def band_week(
    schedule: Schedule,
    children: Mapping[UUID, ChildPresence],
    split_method: str,
    family_ids: Sequence[UUID],
    day: date | None = None,
    overrides: Sequence[PresenceOverride] = (),
) -> WeekBands:
    """Band the nanny's whole week by chronological position, then split each band.

    Order matters and this is the ruling: the *nanny's* 45h week is 40h normal
    plus 5h at 25%, and each of those bands is then shared out. Splitting first
    would give 30h and 15h, both under the threshold, and the majoration would
    vanish — see the module docstring. Banding by position in the week also means
    a Friday evening's overtime lands on whoever's child is actually there, which
    is the same argument that ruled out a fixed per-family percentage.
    """
    total: defaultdict[UUID, Bands] = defaultdict(Bands)
    by_weekday: defaultdict[int, defaultdict[UUID, Bands]] = defaultdict(lambda: defaultdict(Bands))
    minutes_by_weekday: defaultdict[int, int] = defaultdict(int)

    position = 0
    for segment, shares in week_segments(
        schedule, children, split_method, family_ids, day=day, overrides=overrides
    ):
        minutes_by_weekday[segment.weekday] += segment.minutes
        for band, minutes in allocate_bands(position, segment.minutes):
            for family_id, share in shares.items():
                if not share:
                    continue
                portion = Fraction(minutes) * share
                total[family_id] = _add_band(total[family_id], band, portion)
                by_weekday[segment.weekday][family_id] = _add_band(
                    by_weekday[segment.weekday][family_id], band, portion
                )
        position += segment.minutes

    return WeekBands(
        total=dict(total),
        by_weekday={day: dict(per_family) for day, per_family in by_weekday.items()},
        minutes_by_weekday=dict(minutes_by_weekday),
    )


# --- mensualisation ----------------------------------------------------------


def mensualise(bands: Bands, day_weight: Fraction = Fraction(1)) -> Bands:
    """A week's bands as a month's, weighted by the sub-period's share of the month.

    art. 146.1: hebdomadaire x 52 / 12. `day_weight` is the sub-period's share of
    the calendar month, so a mid-month avenant reprices without inventing hours.
    """
    return bands.scaled(Fraction(WEEKS_PER_YEAR, MONTHS_PER_YEAR) * day_weight)


def in_force(snapshots: Sequence[Schedule | Terms], on: date):
    """The latest snapshot effective on `on`, or None. Mirrors Contract.current_*."""
    candidates = [s for s in snapshots if s.effective_from <= on]
    return max(candidates, key=lambda s: s.effective_from) if candidates else None


def sub_periods(data: ContractMonth) -> list[SubPeriod]:
    """Cut the month wherever the schedule or the terms change.

    Each sub-period has exactly one of each, so mensualisation is well defined
    inside it. Weights are shares of the *calendar* month, not of the clipped
    span, so a full month sums to exactly 1 and a mid-month avenant reprices the
    hours without inventing or losing any.
    """
    first, last = month_bounds(data.month)
    start = max(first, data.starting_date)
    end = min(last, data.ending_date) if data.ending_date else last
    if start > end:
        return []

    days_in_month = (last - first).days + 1
    cuts = {start}
    for snapshot in (*data.schedules, *data.terms):
        if start < snapshot.effective_from <= end:
            cuts.add(snapshot.effective_from)
    points = sorted(cuts) + [end + timedelta(days=1)]

    periods: list[SubPeriod] = []
    for begin, stop in zip(points, points[1:], strict=False):
        days = (stop - begin).days
        periods.append(
            SubPeriod(
                start=begin,
                end=stop - timedelta(days=1),
                days=days,
                weight=Fraction(days, days_in_month),
                schedule=in_force(data.schedules, begin),
                terms=in_force(data.terms, begin),
            )
        )
    return periods


# --- unpaid leave ------------------------------------------------------------


def portion_fraction(leave: LeaveSpan, day_minutes: int) -> Fraction:
    """How much of a scheduled day an unpaid leave takes off it."""
    if leave.portion == "full_day":
        return Fraction(1)
    if leave.portion == "half_day":
        return Fraction(1, 2)
    if leave.hours is None or day_minutes == 0:
        return Fraction(0)
    # An hourly leave's `hours` is per day: a three-day leave of 2h is 2h off
    # each of them.
    wanted = Fraction(leave.hours) * MINUTES_PER_HOUR
    return min(Fraction(1), wanted / day_minutes)


def month_attendance(
    data: ContractMonth, banded: Mapping[date, WeekBands]
) -> dict[UUID, tuple[Fraction, Fraction]]:
    """Per family: minutes they would have had this month, and minutes they got.

    Both walked per *date*, never per leave: each date resolves its own weekday
    and its own schedule snapshot. A leave on a day the nanny does not work costs
    nothing, and neither does paid leave — it is already inside the base.
    """
    first, last = month_bounds(data.month)
    planned: defaultdict[UUID, Fraction] = defaultdict(Fraction)
    absent: defaultdict[UUID, Fraction] = defaultdict(Fraction)

    for day in days_between(first, last):
        week = banded.get(day)
        if week is None:
            continue
        for family_id, bands in week.by_weekday.get(day.weekday(), {}).items():
            planned[family_id] += bands.total

    for leave in data.leaves:
        if leave.leave_type not in DEDUCTING_LEAVE_TYPES:
            continue
        for day in days_between(max(leave.start_date, first), min(leave.end_date, last)):
            week = banded.get(day)
            if week is None:
                continue
            day_minutes = week.minutes_by_weekday.get(day.weekday(), 0)
            if not day_minutes:
                continue
            share = portion_fraction(leave, day_minutes)
            if not share:
                continue
            for family_id, bands in week.by_weekday.get(day.weekday(), {}).items():
                absent[family_id] += bands.total * share

    return {
        family_id: (planned[family_id], max(Fraction(0), planned[family_id] - absent[family_id]))
        for family_id in planned
    }


def attendance_ratio(planned: Fraction, worked: Fraction) -> Fraction:
    """The « heures réelles » ratio of CCN 3239 art. 152.1.

    The convention prescribes a *ratio*, not a subtraction:

        salaire mensualisé × heures réellement effectuées dans le mois
                           ÷ heures qui auraient dû être réellement travaillées

    That shape is the point. Subtracting a real day's hours from a smoothed base
    mixes two clocks and breaks in short months: February has 20 working days
    against a base built on an average of 21.7, so a nanny absent *every day of
    February* still had 13.33h left on her declaration. A ratio cannot do that —
    absent all month, the numerator is zero and so is the pay.

    It also self-corrects the other way: a 23-weekday month deducts proportionally
    less per day, which is exactly the smoothing mensualisation exists for.
    """
    if planned <= 0:
        return Fraction(1)
    return min(Fraction(1), worked / planned)


# --- jours fériés ------------------------------------------------------------


def holiday_majoration_ratio(holiday: Holiday) -> Decimal:
    """What a worked holiday owes on top of the hours, as a fraction of them."""
    if not holiday.is_workable or holiday.is_solidarity:
        return Decimal("0")
    if (holiday.day.month, holiday.day.day) == MAY_FIRST:
        return MAY_FIRST_MAJORATION
    return ORDINARY_HOLIDAY_MAJORATION


def holiday_majorations(
    data: ContractMonth, banded: Mapping[date, WeekBands]
) -> dict[UUID, Decimal]:
    """What each family owes on top for the holidays the nanny actually worked.

    A *chômé* holiday returns nothing, and that is not an oversight: the
    mensualised salary already pays it (art. 47.2 maintains the pay, subject to
    the nanny having worked the days either side), and a fixed × 52 ÷ 12 exists
    precisely so a month's shape does not matter. May has more jours fériés than
    March and the base is identical.

    A *worked* one is different. Art. 47.2 owes 10% of the salary due on the hours
    done; art. 47.1 owes 100% on 1 May. It is a supplement on the amount, not
    extra hours — the hours were already declared — so it rides alongside the
    night indemnity rather than through the bands.

    The journée de solidarité is worked and owes nothing: those hours are owed,
    not bought. It is is_workable like any other worked holiday, which is why
    BankHoliday tells them apart.
    """
    first, last = month_bounds(data.month)
    out: defaultdict[UUID, Decimal] = defaultdict(Decimal)

    for holiday in data.holidays:
        if not (first <= holiday.day <= last):
            continue
        if holiday.day < data.starting_date or (
            data.ending_date and holiday.day > data.ending_date
        ):
            continue
        ratio = holiday_majoration_ratio(holiday)
        if not ratio:
            continue
        week = banded.get(holiday.day)
        if week is None:
            continue
        terms = in_force(data.terms, holiday.day)
        if terms is None:
            continue
        # Only the hours the schedule actually places on that weekday; a holiday
        # on a day she never works owes nothing to majorate.
        for family_id, bands in week.by_weekday.get(holiday.day.weekday(), {}).items():
            out[family_id] += _quantize(
                to_hours(bands.total) * terms.net_hourly_rate * ratio, MONEY_QUANTUM
            )
    return dict(out)


# --- exceptional presence ----------------------------------------------------


def presence_corrections(
    data: ContractMonth, children: Mapping[UUID, ChildPresence]
) -> dict[UUID, Bands]:
    """How a child's one-off presence moves the split, per family.

    An ExceptionalPresence does not lengthen the nanny's day — she is already
    there for the others — so this returns a *transfer*, not an addition: the
    corrections sum to zero across the families, and the month's total hours are
    untouched. What moves is who owes them.

    The base is mensualised from the regular week, which is what a base is for; a
    base built from one month's exceptions would not be one. So each affected date
    is re-split with the override applied and the difference against the same date
    without it is carried, leaving every other day alone.
    """
    if not data.overrides:
        return {}
    first, last = month_bounds(data.month)
    by_day: defaultdict[date, list[PresenceOverride]] = defaultdict(list)
    for override in data.overrides:
        if first <= override.day <= last and override.child_id in children:
            by_day[override.day].append(override)

    out: defaultdict[UUID, Bands] = defaultdict(Bands)
    for day in sorted(by_day):
        schedule = in_force(data.schedules, day)
        if schedule is None:
            continue
        if day < data.starting_date or (data.ending_date and day > data.ending_date):
            continue
        if not any(b.weekday == day.weekday() for b in schedule.blocks):
            continue
        # Band the WHOLE week both ways and diff that weekday's slice. Re-banding
        # the day on its own would walk it from position 0, so a Friday in a 45h
        # week — which really straddles the 40h line — would report its whole
        # correction as normal hours and never touch the 25% band. The override
        # moves presence, not minutes, so both walks hit the same band boundaries
        # and the difference is exact per band.
        before = band_week(schedule, children, data.split_method, data.family_ids)
        after = band_week(
            schedule,
            children,
            data.split_method,
            data.family_ids,
            day=day,
            overrides=by_day[day],
        )
        weekday = day.weekday()
        for family_id in data.family_ids:
            out[family_id] = (
                out[family_id]
                + after.by_weekday.get(weekday, {}).get(family_id, Bands())
                - before.by_weekday.get(weekday, {}).get(family_id, Bands())
            )
    return dict(out)


# --- exceptional hours -------------------------------------------------------


def _absolute(day: date, moment: time) -> int:
    """Minutes since an arbitrary epoch, so a night across midnight stays one span."""
    return day.toordinal() * 24 * MINUTES_PER_HOUR + minutes_of(moment)


def family_intervals(entries: Iterable[ExceptionalEntry]) -> dict[UUID, list[tuple[int, int]]]:
    """Each family's own filings, unioned, in absolute minutes.

    Unioned first because a family filing 19:00–21:00 *and* 20:00–22:00 by
    mistake needs the nanny paid for 3h, not 5h.
    """
    spans: defaultdict[UUID, list[tuple[int, int]]] = defaultdict(list)
    for entry in entries:
        spans[entry.family_id].append(
            (
                _absolute(entry.start_date, entry.start_time),
                _absolute(entry.end_date, entry.end_time),
            )
        )
    out: dict[UUID, list[tuple[int, int]]] = {}
    for family_id, raw in spans.items():
        merged: list[tuple[int, int]] = []
        for start, end in sorted(raw):
            if merged and start <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], end))
            else:
                merged.append((start, end))
        out[family_id] = merged
    return out


def _child_counts(children: Mapping[UUID, ChildPresence]) -> dict[UUID, int]:
    counts: defaultdict[UUID, int] = defaultdict(int)
    for child in children.values():
        counts[child.family_id] += 1
    return dict(counts)


def reconcile_exceptional(
    entries: Sequence[ExceptionalEntry],
    children: Mapping[UUID, ChildPresence],
    split_method: str,
    family_ids: Sequence[UUID],
) -> dict[UUID, Fraction]:
    """Minutes of one kind of exceptional hours, per family, after reconciliation.

    Presence is **who filed**, never the children's windows. The windows describe
    the regular week; an exceptional entry is by definition irregular, so a child
    windowed to 16:30–18:00 would read as absent at 19:00 and their family's own
    late night would be billed to the other family.

    Where two families' spans overlap, the nanny worked those minutes once and
    they divide by the contract's usual rule. Where they do not, they are wholly
    the filer's.
    """
    # Filter BEFORE splitting, never after. A filer with no share in the contract
    # would otherwise dilute the split and then be dropped from the result, and
    # the minutes it diluted away would go to nobody: two families filing the same
    # two hours would pay the nanny for one.
    on_contract = set(family_ids)
    spans = family_intervals(e for e in entries if e.family_id in on_contract)
    if not spans:
        return {}

    edges = sorted({edge for intervals in spans.values() for span in intervals for edge in span})
    counts = _child_counts(children)
    out: defaultdict[UUID, Fraction] = defaultdict(Fraction)

    for start, end in zip(edges, edges[1:], strict=False):
        minutes = end - start
        if minutes <= 0:
            continue
        present = [
            family_id
            for family_id, intervals in spans.items()
            if any(a <= start and end <= b for a, b in intervals)
        ]
        if not present:
            continue
        weights = _family_weights(present, counts, split_method)
        total = sum(weights.values())
        for family_id, weight in weights.items():
            out[family_id] += Fraction(minutes) * weight / total

    return dict(out)


def _family_weights(
    present: Sequence[UUID], counts: Mapping[UUID, int], split_method: str
) -> dict[UUID, Fraction]:
    """Weights for a set of families, given how many children each has.

    The counterpart of segment_weights for a context with no children in it —
    exceptional hours are attributed by who filed, not by the windows. Both must
    answer "no children anywhere" the same way, an equal split, or the same
    contract splits its schedule one way and its late nights another.
    """
    if split_method == "equal" or not any(counts.get(f) for f in present):
        return {family_id: Fraction(1) for family_id in present}
    return {family_id: Fraction(max(1, counts.get(family_id, 0))) for family_id in present}


def night_spans(entries: Sequence[ExceptionalEntry]) -> int:
    """How many distinct nights the night-presence entries cover."""
    return len({entry.start_date for entry in entries})


# --- rounding ----------------------------------------------------------------


def apportion(
    total: Decimal, weights: Sequence[Fraction], quantum: Decimal = HOUR_QUANTUM
) -> list[Decimal]:
    """Split `total` by `weights` so the parts sum to `total` exactly.

    Largest-remainder (Hamilton): floor every share to the quantum, then hand the
    leftover quanta to whoever was rounded down hardest. Rounding each share on
    its own instead leaves 10h split three ways summing to 9.99 — and the missing
    cent is the nanny's.
    """
    if not weights:
        return []
    weight_total = sum(weights)
    if weight_total == 0:
        return [Decimal("0")] * len(weights)

    units = int((total / quantum).to_integral_value(rounding=ROUND_HALF_UP))
    exact = [Fraction(units) * weight / weight_total for weight in weights]
    # floor(), not int(): int() truncates toward zero, so a negative total would
    # leave `leftover` negative and `order[:leftover]` would silently DROP shares
    # instead of topping them up, breaking the one invariant this function has.
    floors = [math.floor(value) for value in exact]
    leftover = units - sum(floors)
    order = sorted(range(len(exact)), key=lambda i: exact[i] - floors[i], reverse=True)
    for index in order[:leftover]:
        floors[index] += 1
    return [Decimal(count) * quantum for count in floors]


# --- the whole month ---------------------------------------------------------


def _iso_week(day: date) -> tuple[int, int]:
    year, week, _ = day.isocalendar()
    return year, week


def _exceptional_bands(
    data: ContractMonth,
    children: Mapping[UUID, ChildPresence],
    kinds: Mapping[str, Fraction],
) -> dict[UUID, Bands]:
    """Exceptional hours, banded on top of the contractual week they fall in.

    They sit *after* the contractual week, not beside it: an extra evening in a
    week already at 40h is overtime, and would not be if it were banded on its own
    from zero. All kinds are banded together for the same reason — an hour of
    effective work and an hour of présence responsable in the same week stack, so
    banding each kind from the same anchor would hand out two 25% bands and never
    reach 50%.

    ``kinds`` maps a kind to what an hour of it is worth in effective hours
    (présence responsable is two thirds of one).

    Two caveats worth knowing rather than discovering:

    * A week straddling a month boundary is banded from the contractual week in
      *each* month, because the dataset is month-scoped and cannot see the other
      half. A Friday-and-Saturday overtime pair split across two declarations may
      therefore under-band. Fixing it means loading whole ISO weeks, which is a
      repo-layer change.
    * Entries are clipped to the month and to the contract's own span, which the
      base already is via `sub_periods`.
    """
    first, last = month_bounds(data.month)
    start = max(first, data.starting_date)
    end = min(last, data.ending_date) if data.ending_date else last

    by_week: defaultdict[tuple[int, int], list[tuple[ExceptionalEntry, Fraction]]] = defaultdict(
        list
    )
    for entry in data.exceptional:
        ratio = kinds.get(entry.kind)
        if ratio is None or not (start <= entry.start_date <= end):
            continue
        by_week[_iso_week(entry.start_date)].append((entry, ratio))

    out: defaultdict[UUID, Bands] = defaultdict(Bands)
    # Sorted so the result cannot depend on the order rows came back in. Anchoring
    # on `entries[0]` — as this once did — meant the same data declared different
    # hours depending on which entry the ORM happened to yield first.
    for week in sorted(by_week):
        entries = sorted(by_week[week], key=lambda pair: (pair[0].start_date, pair[0].start_time))
        anchor_day = entries[0][0].start_date
        schedule = in_force(data.schedules, anchor_day)
        contractual = (
            band_week(schedule, children, data.split_method, data.family_ids).weekly_minutes
            if schedule
            else 0
        )

        # Reconcile each kind's entries AS A SET, then pool the kinds so the bands
        # are walked once. Passing one entry at a time reads harmlessly and is the
        # whole bug: a lone entry has nothing to reconcile against, so every filer
        # collects 100% of its own hours, and two families on the same evening bill
        # the nanny for it twice. Kinds are grouped first because they do not
        # reconcile with each other — a night and an evening are different work.
        by_kind: defaultdict[str, list[ExceptionalEntry]] = defaultdict(list)
        for entry, _ratio in entries:
            by_kind[entry.kind].append(entry)

        per_family: defaultdict[UUID, Fraction] = defaultdict(Fraction)
        for kind, kind_entries in by_kind.items():
            split = reconcile_exceptional(
                kind_entries, children, data.split_method, data.family_ids
            )
            for family_id, minutes in split.items():
                per_family[family_id] += minutes * kinds[kind]

        total = sum(per_family.values(), Fraction(0))
        if total <= 0:
            continue
        # Exact: rounding the pooled minutes to an int here would silently drop up
        # to a minute of présence responsable per week (two thirds of 100 is not
        # an integer).
        position = Fraction(contractual)
        for family_id, family_minutes in per_family.items():
            share = family_minutes / total
            for band, minutes in allocate_bands(position, total):
                out[family_id] = _add_band(out[family_id], band, minutes * share)
    return dict(out)


def night_indemnity_ratio(interventions: int) -> Fraction:
    """The fraction of an equivalent hour's pay a night is worth (art. 137.2)."""
    if interventions >= NIGHT_INTERVENTIONS_DISTURBED:
        return NIGHT_INDEMNITY_DISTURBED_RATIO
    return NIGHT_INDEMNITY_FLOOR_RATIO


def _night_indemnity(
    data: ContractMonth, children: Mapping[UUID, ChildPresence], terms: Terms | None
) -> tuple[dict[UUID, Decimal], dict[UUID, int], list[str]]:
    """Présence de nuit: an indemnity, priced by the hour, never banded hours.

    Art. 137.2 prices every tier as a fraction "du salaire contractuel versé pour
    une durée de travail effectif équivalente" — of what those hours of real work
    would have paid. So the unit is the hour and a longer night costs more; a
    contract quoting a flat "x € par nuit" expresses the same thing for its own
    expected duration, not a different rule.

    The rate is the better of what the parties agreed and what the article
    requires, resolved PER NIGHT: a night the nanny was woken twice is owed a
    third rather than a quarter, and that is an obligation ("est portée à"), not
    a floor to warn about.

    Two cases warn instead of returning a number. From four interventions the
    interventions themselves are paid as full effective work, and if every night
    reaches four the presence must be requalified and the contract revised.
    Neither is computable without the interventions' durations, which nothing
    records.
    """
    entries = [e for e in data.exceptional if e.kind == "night_presence"]
    if not entries or terms is None:
        return {}, {}, []

    warnings: list[str] = []
    if any(
        _absolute(e.end_date, e.end_time) - _absolute(e.start_date, e.start_time)
        > NIGHT_PRESENCE_MAX_MINUTES
        for e in entries
    ):
        warnings.append("night_presence_longer_than_12h")
    if any(e.interventions >= NIGHT_INTERVENTIONS_FULL_RATE for e in entries):
        warnings.append("night_interventions_need_manual_pricing")
    if all(e.interventions >= NIGHT_INTERVENTIONS_FULL_RATE for e in entries):
        warnings.append("night_presence_should_be_requalified")

    by_night: defaultdict[date, list[ExceptionalEntry]] = defaultdict(list)
    for entry in entries:
        by_night[entry.start_date].append(entry)

    amounts: defaultdict[UUID, Decimal] = defaultdict(Decimal)
    counts: defaultdict[UUID, set[date]] = defaultdict(set)
    below_floor = False

    for night, night_entries in by_night.items():
        interventions = max(e.interventions for e in night_entries)
        required = Fraction(terms.net_hourly_rate) * night_indemnity_ratio(interventions)
        agreed = Fraction(terms.night_presence_rate)
        if agreed < required:
            below_floor = True
        rate = max(agreed, required)
        per_family = reconcile_exceptional(
            night_entries, children, data.split_method, data.family_ids
        )
        for family_id, minutes in per_family.items():
            value = minutes / MINUTES_PER_HOUR * rate
            amounts[family_id] += _quantize(
                Decimal(value.numerator) / Decimal(value.denominator), MONEY_QUANTUM
            )
            counts[family_id].add(night)

    if below_floor:
        # Soft, like the minimum-wage check: the month still computes, priced at
        # what the article requires rather than at what was agreed.
        warnings.append("night_presence_rate_below_floor")

    nights = {family_id: len(dates) for family_id, dates in counts.items() if dates}
    return dict(amounts), nights, warnings


def build_base(
    data: ContractMonth, children: Mapping[UUID, ChildPresence]
) -> tuple[list[tuple[SubPeriod, dict[UUID, Bands]]], dict[date, WeekBands], list[dict]]:
    """The mensualised base, per sub-period, plus the rate detail behind it.

    Kept per sub-period rather than summed. Collapsing them here is what made a
    mid-month raise price the whole month at the new rate: sub_periods had already
    cut the month correctly and the cut bought nothing, because the pricing only
    ever saw the total.
    """
    per_period: list[tuple[SubPeriod, dict[UUID, Bands]]] = []
    banded_by_date: dict[date, WeekBands] = {}
    rate_periods: list[dict] = []

    for period in sub_periods(data):
        if period.schedule is None:
            continue
        week = band_week(period.schedule, children, data.split_method, data.family_ids)
        for day in days_between(period.start, period.end):
            banded_by_date[day] = week
        per_period.append(
            (period, {f: mensualise(b, period.weight) for f, b in week.total.items()})
        )
        if period.terms is not None:
            rate_periods.append(
                {
                    "from": period.start.isoformat(),
                    "to": period.end.isoformat(),
                    "days": period.days,
                    "net_hourly_rate": str(period.terms.net_hourly_rate),
                    "night_presence_rate": str(period.terms.night_presence_rate),
                    "transport_fee": str(period.terms.transport_fee),
                    "mileage_rate": str(period.terms.mileage_rate),
                    "benefits_in_kind": str(period.terms.benefits_in_kind),
                }
            )
    return per_period, banded_by_date, rate_periods


def exceptional_top_up(
    data: ContractMonth, children: Mapping[UUID, ChildPresence], warnings: list[str]
) -> dict[UUID, Bands]:
    """Exceptional hours and presence corrections, as bands to add to the base."""
    # art. 137.1 excludes présence responsable from a garde partagée. The model
    # rejects new entries, but a row predating the rule must not quietly pay two
    # thirds — so on a shared contract it counts as the effective work it was, and
    # the discrepancy is surfaced.
    shared = len(data.family_ids) > 1
    kinds: dict[str, Fraction] = {"effective": Fraction(1)}
    if shared and any(e.kind == "presence_responsable" for e in data.exceptional):
        warnings.append("presence_responsable_in_shared_care")
        kinds["presence_responsable"] = Fraction(1)
    elif not shared:
        kinds["presence_responsable"] = PRESENCE_RESPONSABLE_RATIO

    extra = _exceptional_bands(data, children, kinds)
    # A child there outside their window moves the split without lengthening the
    # nanny's day, so this nets to zero across the families.
    for family_id, bands in presence_corrections(data, children).items():
        extra[family_id] = extra.get(family_id, Bands()) + bands
    return extra


def prorate_for_absence(
    per_period: Sequence[tuple[SubPeriod, Mapping[UUID, Bands]]],
    data: ContractMonth,
    banded_by_date: Mapping[date, WeekBands],
) -> list[tuple[SubPeriod, dict[UUID, Bands]]]:
    """Scale the base by attendance — art. 152.1's ratio, not a subtraction."""
    attendance = month_attendance(data, banded_by_date)
    ratios = {
        family_id: attendance_ratio(*attendance.get(family_id, (Fraction(0), Fraction(0))))
        for family_id in data.family_ids
    }
    return [
        (period, {f: b.scaled(ratios.get(f, Fraction(1))) for f, b in bands.items()})
        for period, bands in per_period
    ]


def round_across_families(
    totals: Mapping[UUID, Bands], family_ids: Sequence[UUID]
) -> list[list[Decimal]]:
    """Each band's hours, apportioned across the families so they sum to the band.

    Across, not per family. Rounding a family's bands on their own loses the nanny
    a centihour on every band that does not divide cleanly: two families sharing a
    216.67h month would declare 108.33 each and the last one would be worked by
    nobody.
    """
    return [
        apportion(to_hours(sum(column, Fraction(0))), column)
        for column in (
            [totals[family_id].normal for family_id in family_ids],
            [totals[family_id].at_25 for family_id in family_ids],
            [totals[family_id].at_50 for family_id in family_ids],
        )
    ]


def compute_month(data: ContractMonth) -> dict[UUID, FamilyResult]:
    """One month of one contract, as each family must declare it.

    The nanny's week is banded, each band split between the families, mensualised,
    prorated by attendance, and topped up with exceptional hours. Advantages follow
    each family's weight in the month. Everything is rounded once, at the end, so
    the parts still sum to the whole.
    """
    children = {child.child_id: child for child in data.children}
    warnings: list[str] = []

    per_period, banded_by_date, rate_periods = build_base(data, children)
    if len({p["net_hourly_rate"] for p in rate_periods}) > 1:
        warnings.append("rates_changed_mid_month")
    if not any(child.family_id in data.family_ids for child in data.children):
        # The equal-split fallback is about to carry the whole month. Correct, and
        # the status quo for a contract that predates the children — but say so
        # rather than let it read as a split derived from who was actually there.
        warnings.append("split_without_children")

    per_period = prorate_for_absence(per_period, data, banded_by_date)
    extra = exceptional_top_up(data, children, warnings)

    _, last = month_bounds(data.month)
    current = in_force(data.terms, last) or (data.terms[-1] if data.terms else None)
    nights, nights_by_family, night_warnings = _night_indemnity(data, children, current)
    warnings += night_warnings
    holidays = holiday_majorations(data, banded_by_date)

    totals: dict[UUID, Bands] = {}
    for family_id in data.family_ids:
        combined = Bands()
        for _period, bands in per_period:
            combined = combined + bands.get(family_id, Bands())
        totals[family_id] = (combined + extra.get(family_id, Bands())).clamped()

    # Advantages are one monthly lump for one nanny, so they follow each family's
    # weight in the month rather than being declared whole by each — otherwise she
    # is credited a multiple of what was agreed.
    weights = [totals[family_id].total for family_id in data.family_ids]
    transport = apportion(
        current.transport_fee if current else Decimal("0"), weights, MONEY_QUANTUM
    )
    in_kind = apportion(
        current.benefits_in_kind if current else Decimal("0"), weights, MONEY_QUANTUM
    )
    hours_by_band = round_across_families(totals, data.family_ids)

    kilometers = data.kilometers or {}
    rate = current.net_hourly_rate if current else Decimal("0")
    mileage_rate = current.mileage_rate if current else Decimal("0")

    results: dict[UUID, FamilyResult] = {}
    for index, family_id in enumerate(data.family_ids):
        normal_hours, hours_25, hours_50 = (band[index] for band in hours_by_band)
        km = kilometers.get(family_id, Decimal("0"))
        night = nights.get(family_id, Decimal("0"))
        holiday = holidays.get(family_id, Decimal("0"))
        # Priced per sub-period, each at its own rate, so a mid-month avenant is
        # charged for the days it actually applied to. With one period — nearly
        # always — this is exactly hours x rate, which is what pajemploi asks the
        # parent to type.
        salary = _period_amount(per_period, extra, family_id, current)
        results[family_id] = FamilyResult(
            family_id=family_id,
            normal_hours=normal_hours,
            hours_25=hours_25,
            hours_50=hours_50,
            night_count=nights_by_family.get(family_id, 0),
            night_indemnity=night,
            holiday_majoration=holiday,
            transport_amount=transport[index],
            benefits_in_kind_amount=in_kind[index],
            kilometers=km,
            mileage_amount=_quantize(km * mileage_rate, MONEY_QUANTUM),
            total_amount=_quantize(salary + night + holiday, MONEY_QUANTUM),
            net_hourly_rate=rate,
            night_presence_rate=current.night_presence_rate if current else Decimal("0"),
            mileage_rate=mileage_rate,
            rate_periods=tuple(rate_periods),
            warnings=tuple(warnings),
        )
    return results


def _period_amount(
    per_period: Sequence[tuple[SubPeriod, Mapping[UUID, Bands]]],
    extra: Mapping[UUID, Bands],
    family_id: UUID,
    current: Terms | None,
) -> Decimal:
    """A family's salary, each sub-period priced at the rate in force then."""
    total = Decimal("0")
    for period, bands in per_period:
        terms = period.terms or current
        if terms is None:
            continue
        total += _price(bands.get(family_id, Bands()), terms.net_hourly_rate)
    if current is not None:
        total += _price(extra.get(family_id, Bands()), current.net_hourly_rate)
    return _quantize(total, MONEY_QUANTUM)


def _price(bands: Bands, rate: Decimal) -> Decimal:
    return (
        to_hours(bands.normal) * rate
        + to_hours(bands.at_25) * rate * MAJORATION_25
        + to_hours(bands.at_50) * rate * MAJORATION_50
    )
