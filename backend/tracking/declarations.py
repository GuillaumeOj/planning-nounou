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

#: "Présence de nuit" runs 20:00–06:30 and is paid as a flat indemnity, not as
#: hours. URSSAF sets only a floor: a quarter of the contractual rate.
NIGHT_PRESENCE_START = time(20, 0)
NIGHT_PRESENCE_END = time(6, 30)
NIGHT_INDEMNITY_FLOOR_RATIO = Decimal("0.25")
NIGHT_PRESENCE_MAX_MINUTES = 12 * 60

MONTHS_PER_YEAR = 12
#: A full year: 47 worked weeks + 5 of paid leave.
DEFAULT_WEEKS_PER_YEAR = 52

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
    effective_from: date
    weeks_per_year: int
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
    start_time: time | None = None
    end_time: time | None = None


@dataclass(frozen=True, slots=True)
class ExceptionalEntry:
    """Hours beyond the schedule, filed by one family."""

    family_id: UUID
    kind: str
    start_date: date
    start_time: time
    end_date: date
    end_time: time


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
        """No band may go negative — a month of unpaid leave deducts to zero, not below."""
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
    kilometers: Mapping[UUID, Decimal] | None = None


@dataclass(frozen=True, slots=True)
class FamilyResult:
    family_id: UUID
    normal_hours: Decimal
    hours_25: Decimal
    hours_50: Decimal
    night_count: int
    night_indemnity: Decimal
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
    with any override for the date — an override *adds* presence, it does not
    replace the regular week.
    """
    if not child.windows:
        return None
    intervals = [Interval(w.start, w.end) for w in child.windows if w.weekday == day.weekday()]
    intervals += [Interval(o.start, o.end) for o in overrides if o.child_id == child.child_id]
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
    """Each family's share of a segment. Sums to exactly 1.

    With no child present the weights would all be zero. Dropping the segment
    would break the sum invariant and underpay the nanny, so it falls back to an
    equal split over every family on the contract. That is not a defensive
    branch: a contract with no children listed takes it for *every* segment,
    which is what keeps this feature additive for contracts that predate it —
    equal when shared, 100% when solo, i.e. the status quo.
    """
    counts: defaultdict[UUID, int] = defaultdict(int)
    for child_id in present:
        child = children.get(child_id)
        if child is not None:
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


def is_uncovered(present: frozenset[UUID], children: Mapping[UUID, ChildPresence]) -> bool:
    """True when a segment has no child on the contract in it (see above)."""
    return not any(child_id in children for child_id in present)


# --- banding -----------------------------------------------------------------


def _band_at(position: int) -> tuple[int, int | None]:
    """The band a minute at `position` in the week falls in, and its room left."""
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


def allocate_bands(start_position: int, minutes: int) -> list[tuple[int, int]]:
    """Split `minutes` starting at `start_position` in the week into (band, minutes)."""
    out: list[tuple[int, int]] = []
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
) -> list[tuple[Segment, dict[UUID, Fraction]]]:
    """Every segment of the schedule's week, in order, with its family shares."""
    out: list[tuple[Segment, dict[UUID, Fraction]]] = []
    for block in sorted(schedule.blocks, key=lambda b: (b.weekday, b.start)):
        day = date(2024, 1, 1) + timedelta(days=block.weekday)  # a Monday; weekday only
        presences = {child_id: presence_on(child, day) for child_id, child in children.items()}
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
    for segment, shares in week_segments(schedule, children, split_method, family_ids):
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


def mensualise(bands: Bands, weeks_per_year: int, day_weight: Fraction = Fraction(1)) -> Bands:
    """A week's bands as a month's, weighted by the sub-period's share of the month."""
    return bands.scaled(Fraction(weeks_per_year, MONTHS_PER_YEAR) * day_weight)


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
    # each of them. Its bands come off in the same mix as the day's own, which
    # is exact whenever the day sits in one band — i.e. nearly always.
    wanted = Fraction(leave.hours) * MINUTES_PER_HOUR
    return min(Fraction(1), wanted / day_minutes)


def leave_deduction(data: ContractMonth, banded: Mapping[date, WeekBands]) -> dict[UUID, Bands]:
    """Mensualised minutes each family does not owe, because the nanny was off.

    Walked per *date*, never per leave: each date resolves its own weekday and
    its own schedule snapshot. A leave on a day the nanny does not work deducts
    nothing, and so does paid leave — it is already inside the base.
    """
    first, last = month_bounds(data.month)
    out: defaultdict[UUID, Bands] = defaultdict(Bands)

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
            # The day's bands are one week's worth; the base pays 52/12 of a week
            # per month, so a real day off is worth a real day, not a mensualised
            # one. Deduct the day itself.
            for family_id, bands in week.by_weekday.get(day.weekday(), {}).items():
                out[family_id] = out[family_id] + bands.scaled(share)

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
    spans = family_intervals(entries)
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
        if split_method == "equal":
            weights = {family_id: Fraction(1) for family_id in present}
        else:
            weights = {family_id: Fraction(counts.get(family_id, 1) or 1) for family_id in present}
        total = sum(weights.values())
        for family_id, weight in weights.items():
            out[family_id] += Fraction(minutes) * weight / total

    return {family_id: value for family_id, value in out.items() if family_id in family_ids}


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
    floors = [int(value) for value in exact]
    leftover = units - sum(floors)
    order = sorted(range(len(exact)), key=lambda i: exact[i] - floors[i], reverse=True)
    for index in order[:leftover]:
        floors[index] += 1
    return [Decimal(count) * quantum for count in floors]


def amount(bands: Bands, rate: Decimal) -> Decimal:
    """What a set of banded hours is worth at `rate`."""
    return _quantize(
        to_hours(bands.normal) * rate
        + to_hours(bands.at_25) * rate * MAJORATION_25
        + to_hours(bands.at_50) * rate * MAJORATION_50,
        MONEY_QUANTUM,
    )


# --- the whole month ---------------------------------------------------------


def _iso_week(day: date) -> tuple[int, int]:
    year, week, _ = day.isocalendar()
    return year, week


def _exceptional_bands(
    data: ContractMonth,
    children: Mapping[UUID, ChildPresence],
    kind: str,
    ratio: Fraction,
) -> dict[UUID, Bands]:
    """Exceptional hours of one kind, banded on top of the week they fall in.

    They sit *after* the contractual week, not beside it: an extra evening in a
    week already at 40h is overtime, and would not be if it were banded on its
    own from zero.
    """
    by_week: defaultdict[tuple[int, int], list[ExceptionalEntry]] = defaultdict(list)
    for entry in data.exceptional:
        if entry.kind == kind:
            by_week[_iso_week(entry.start_date)].append(entry)

    out: defaultdict[UUID, Bands] = defaultdict(Bands)
    for entries in by_week.values():
        per_family = reconcile_exceptional(entries, children, data.split_method, data.family_ids)
        total = sum(per_family.values(), Fraction(0)) * ratio
        if total <= 0:
            continue
        schedule = in_force(data.schedules, entries[0].start_date)
        contractual = (
            band_week(schedule, children, data.split_method, data.family_ids).weekly_minutes
            if schedule
            else 0
        )
        for band, minutes in allocate_bands(contractual, int(total)):
            for family_id, family_minutes in per_family.items():
                share = family_minutes * ratio / total
                out[family_id] = _add_band(out[family_id], band, Fraction(minutes) * share)
    return dict(out)


def _night_indemnity(
    data: ContractMonth, children: Mapping[UUID, ChildPresence], terms: Terms | None
) -> tuple[dict[UUID, Decimal], int, list[str]]:
    """Présence de nuit: a flat indemnity per hour, never banded hours."""
    entries = [e for e in data.exceptional if e.kind == "night_presence"]
    if not entries or terms is None:
        return {}, 0, []

    warnings: list[str] = []
    floor = _quantize(terms.net_hourly_rate * NIGHT_INDEMNITY_FLOOR_RATIO, MONEY_QUANTUM)
    rate = terms.night_presence_rate
    if rate < floor:
        # Soft, like the minimum-wage check: flag it, do not block the month.
        warnings.append("night_presence_rate_below_floor")
    if any(
        _absolute(e.end_date, e.end_time) - _absolute(e.start_date, e.start_time)
        > NIGHT_PRESENCE_MAX_MINUTES
        for e in entries
    ):
        warnings.append("night_presence_longer_than_12h")

    per_family = reconcile_exceptional(entries, children, data.split_method, data.family_ids)
    amounts = {
        family_id: _quantize(to_hours(minutes) * rate, MONEY_QUANTUM)
        for family_id, minutes in per_family.items()
    }
    return amounts, night_spans(entries), warnings


def compute_month(data: ContractMonth) -> dict[UUID, FamilyResult]:
    """One month of one contract, as each family must declare it.

    Base (banded then split then mensualised), minus unpaid leave, plus
    exceptional hours; advantages shared by each family's weight in the month;
    everything rounded once, at the end, so the parts still sum to the whole.
    """
    children = {child.child_id: child for child in data.children}
    periods = sub_periods(data)
    warnings: list[str] = []

    base: defaultdict[UUID, Bands] = defaultdict(Bands)
    banded_by_date: dict[date, WeekBands] = {}
    rate_periods: list[dict] = []

    for period in periods:
        if period.schedule is None:
            continue
        week = band_week(period.schedule, children, data.split_method, data.family_ids)
        for day in days_between(period.start, period.end):
            banded_by_date[day] = week
        for family_id, bands in week.total.items():
            base[family_id] = base[family_id] + mensualise(
                bands, period.schedule.weeks_per_year, period.weight
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
                    "weeks_per_year": period.schedule.weeks_per_year,
                }
            )

    if len({p["net_hourly_rate"] for p in rate_periods}) > 1:
        # Then total != hours × rate, and the flat rate the UI shows cannot
        # reproduce the figure on its own. Say so rather than let it look wrong.
        warnings.append("rates_changed_mid_month")

    for family_id, bands in leave_deduction(data, banded_by_date).items():
        base[family_id] = (base[family_id] - bands).clamped()

    for family_id, bands in _exceptional_bands(data, children, "effective", Fraction(1)).items():
        base[family_id] = base[family_id] + bands
    for family_id, bands in _exceptional_bands(
        data, children, "presence_responsable", PRESENCE_RESPONSABLE_RATIO
    ).items():
        base[family_id] = base[family_id] + bands

    # The terms in force on the month's last day: what the UI shows, and the
    # whole story whenever the month has a single snapshot, which is nearly always.
    _, last = month_bounds(data.month)
    current = in_force(data.terms, last) or (data.terms[-1] if data.terms else None)
    nights, night_count, night_warnings = _night_indemnity(data, children, current)
    warnings += night_warnings

    # Advantages are one monthly lump for one nanny, so they follow each family's
    # weight in the month rather than being declared whole by each — otherwise
    # she is credited a multiple of what was agreed.
    weights = [base[family_id].total for family_id in data.family_ids]
    kilometers = data.kilometers or {}
    rate = current.net_hourly_rate if current else Decimal("0")
    transport = apportion(
        current.transport_fee if current else Decimal("0"), weights, MONEY_QUANTUM
    )
    in_kind = apportion(
        current.benefits_in_kind if current else Decimal("0"), weights, MONEY_QUANTUM
    )

    # Round each band ACROSS the families, not each family's bands on their own.
    # Rounding per family loses the nanny a centihour on every band that does not
    # divide cleanly: two families sharing a 216.67h month would declare 108.33
    # each and the last one would simply never be worked by anybody. Apportioning
    # per band keeps every band's parts summing to the band, and therefore every
    # family's total summing to the month.
    hours_by_band = [
        apportion(to_hours(sum(column, Fraction(0))), column)
        for column in (
            [base[family_id].normal for family_id in data.family_ids],
            [base[family_id].at_25 for family_id in data.family_ids],
            [base[family_id].at_50 for family_id in data.family_ids],
        )
    ]

    results: dict[UUID, FamilyResult] = {}
    for index, family_id in enumerate(data.family_ids):
        normal_hours, hours_25, hours_50 = (band[index] for band in hours_by_band)
        km = kilometers.get(family_id, Decimal("0"))
        mileage_rate = current.mileage_rate if current else Decimal("0")
        mileage = _quantize(km * mileage_rate, MONEY_QUANTUM)
        night = nights.get(family_id, Decimal("0"))
        # Priced from the *rounded* hours, so the total is the one a parent gets
        # back when they retype these three numbers into pajemploi.
        results[family_id] = FamilyResult(
            family_id=family_id,
            normal_hours=normal_hours,
            hours_25=hours_25,
            hours_50=hours_50,
            night_count=night_count,
            night_indemnity=night,
            transport_amount=transport[index],
            benefits_in_kind_amount=in_kind[index],
            kilometers=km,
            mileage_amount=mileage,
            total_amount=_quantize(
                normal_hours * rate
                + hours_25 * rate * MAJORATION_25
                + hours_50 * rate * MAJORATION_50
                + night,
                MONEY_QUANTUM,
            ),
            net_hourly_rate=rate,
            night_presence_rate=current.night_presence_rate if current else Decimal("0"),
            mileage_rate=mileage_rate,
            rate_periods=tuple(rate_periods),
            warnings=tuple(warnings),
        )
    return results
