from __future__ import annotations

from datetime import date as date_cls
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from .models import (
    BankHoliday,
    Contract,
    ContractChild,
    ContractChildWindow,
    ContractInvitation,
    ContractSchedule,
    ContractTerms,
    ExceptionalHours,
    ExceptionalPresence,
    Leave,
    MinimumWage,
    MonthlyDeclaration,
    Nanny,
    ScheduleBlock,
)
from .sources import source_for

NON_NEGATIVE_DECIMAL = {"min_value": Decimal("0")}
_MISSING = object()


def _effective_to(instance) -> date_cls | None:
    """The day before the next snapshot takes effect, or None if it is the latest.

    Shared by terms and schedules — both are effective-dated snapshots keyed on
    ``(contract, effective_from)``.
    """
    nxt = (
        type(instance)
        .objects.filter(
            contract_id=instance.contract_id, effective_from__gt=instance.effective_from
        )
        .order_by("effective_from")
        .values_list("effective_from", flat=True)
        .first()
    )
    return (nxt - timedelta(days=1)) if nxt else None


class NannyBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Nanny
        fields = ("id", "first_name", "last_name")
        read_only_fields = fields


class ContractTermsSerializer(serializers.ModelSerializer):
    """An effective-dated compensation snapshot.

    The net-hourly minimum is a *soft* check: below-minimum values still save,
    but the response carries ``below_minimum`` and a translated ``warnings`` list
    so the client can surface it.
    """

    effective_to = serializers.SerializerMethodField()
    minimum_net_hourly_rate = serializers.SerializerMethodField()
    below_minimum = serializers.SerializerMethodField()
    warnings = serializers.SerializerMethodField()

    class Meta:
        model = ContractTerms
        fields = (
            "id",
            "effective_from",
            "effective_to",
            "net_hourly_rate",
            "transport_fee",
            "mileage_rate",
            "benefits_in_kind",
            "minimum_net_hourly_rate",
            "below_minimum",
            "warnings",
            "edited",
        )
        read_only_fields = (
            "id",
            "effective_to",
            "minimum_net_hourly_rate",
            "below_minimum",
            "warnings",
            "edited",
        )
        extra_kwargs = {
            "net_hourly_rate": NON_NEGATIVE_DECIMAL,
            "transport_fee": NON_NEGATIVE_DECIMAL,
            "mileage_rate": NON_NEGATIVE_DECIMAL,
            "benefits_in_kind": NON_NEGATIVE_DECIMAL,
        }

    def get_effective_to(self, obj: ContractTerms) -> str | None:
        end = _effective_to(obj)
        return end.isoformat() if end else None

    def _minimum(self, obj: ContractTerms) -> Decimal | None:
        # The three min-wage fields below all need the minimum in force on this
        # snapshot's effective date; look it up once and memoize per date so a
        # history list doesn't run the same query three times per row.
        cache = self.__dict__.setdefault("_min_by_date", {})
        if obj.effective_from not in cache:
            cache[obj.effective_from] = MinimumWage.applicable_on(obj.effective_from)
        return cache[obj.effective_from]

    def get_minimum_net_hourly_rate(self, obj: ContractTerms) -> str | None:
        minimum = self._minimum(obj)
        return f"{minimum:.2f}" if minimum is not None else None

    def get_below_minimum(self, obj: ContractTerms) -> bool:
        minimum = self._minimum(obj)
        return minimum is not None and obj.net_hourly_rate < minimum

    def get_warnings(self, obj: ContractTerms) -> list[str]:
        minimum = self._minimum(obj)
        if minimum is not None and obj.net_hourly_rate < minimum:
            return [
                _("The net hourly rate (%(rate)s €) is below the recommended minimum of %(min)s €.")
                % {"rate": obj.net_hourly_rate, "min": minimum}
            ]
        return []


class ScheduleBlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScheduleBlock
        fields = ("id", "weekday", "start_time", "end_time")
        read_only_fields = ("id",)

    def validate(self, attrs: dict) -> dict:
        if attrs["end_time"] <= attrs["start_time"]:
            raise serializers.ValidationError(
                {"end_time": _("The end time must be after the start time.")}
            )
        return attrs


def _block_hours(start, end) -> float:
    delta = datetime.combine(date_cls.min, end) - datetime.combine(date_cls.min, start)
    return delta.total_seconds() / 3600


class ContractScheduleSerializer(serializers.ModelSerializer):
    """An effective-dated weekly schedule; editing creates a new dated snapshot."""

    blocks = ScheduleBlockSerializer(many=True)
    effective_to = serializers.SerializerMethodField()
    weekly_hours = serializers.SerializerMethodField()

    class Meta:
        model = ContractSchedule
        fields = ("id", "effective_from", "effective_to", "weekly_hours", "edited", "blocks")
        read_only_fields = ("id", "effective_to", "weekly_hours", "edited")

    def get_effective_to(self, obj: ContractSchedule) -> str | None:
        end = _effective_to(obj)
        return end.isoformat() if end else None

    def get_weekly_hours(self, obj: ContractSchedule) -> float:
        return round(sum(_block_hours(b.start_time, b.end_time) for b in obj.blocks.all()), 2)

    def validate_blocks(self, blocks: list[dict]) -> list[dict]:
        by_day: dict[int, list[dict]] = {}
        for block in blocks:
            by_day.setdefault(block["weekday"], []).append(block)
        for day_blocks in by_day.values():
            ordered = sorted(day_blocks, key=lambda b: b["start_time"])
            for earlier, later in zip(ordered, ordered[1:], strict=False):
                if later["start_time"] < earlier["end_time"]:
                    raise serializers.ValidationError(
                        _("Time blocks on the same day cannot overlap.")
                    )
        return blocks

    def create(self, validated_data: dict) -> ContractSchedule:
        blocks = validated_data.pop("blocks")
        schedule = ContractSchedule.objects.create(**validated_data)
        ScheduleBlock.objects.bulk_create(
            ScheduleBlock(schedule=schedule, **block) for block in blocks
        )
        return schedule

    def update(self, instance: ContractSchedule, validated_data: dict) -> ContractSchedule:
        # Correcting a snapshot in place: replace its blocks wholesale.
        blocks = validated_data.pop("blocks", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if blocks is not None:
            instance.blocks.all().delete()
            ScheduleBlock.objects.bulk_create(
                ScheduleBlock(schedule=instance, **block) for block in blocks
            )
        return instance


class LeaveSerializer(serializers.ModelSerializer):
    """A nanny's day(s) off. Flat CRUD — no versioning."""

    class Meta:
        model = Leave
        fields = ("id", "leave_type", "start_date", "end_date", "portion", "hours", "notes")
        read_only_fields = ("id",)

    def validate(self, attrs: dict) -> dict:
        # Merge against the instance so PATCH validates the resulting state.
        def resolved(field):
            if field in attrs:
                return attrs[field]
            return getattr(self.instance, field, None)

        start = resolved("start_date")
        end = resolved("end_date")
        leave_type = resolved("leave_type")
        portion = resolved("portion")
        hours = resolved("hours")

        if start and end and end < start:
            raise serializers.ValidationError(
                {"end_date": _("The ending date cannot be before the starting date.")}
            )
        if portion == Leave.Portion.HOURLY:
            if leave_type != Leave.LeaveType.UNPAID:
                raise serializers.ValidationError(
                    {"portion": _("Only unpaid leaves can be counted by the hour.")}
                )
            if hours is None:
                raise serializers.ValidationError(
                    {"hours": _("Give the number of hours for an hourly leave.")}
                )
        elif hours is not None:
            raise serializers.ValidationError({"hours": _("Hours only apply to an hourly leave.")})
        return attrs


class BankHolidaySerializer(serializers.ModelSerializer):
    """A national work-free day. Read-only over the API (admin-managed)."""

    class Meta:
        model = BankHoliday
        fields = ("id", "name", "date", "is_workable")
        read_only_fields = ("id",)


class ContractSerializer(serializers.ModelSerializer):
    """A shared nanny contract.

    On create, either reuse an existing ``nanny_id`` (one the acting family
    already works with) or create a person inline from ``first_name``/
    ``last_name``. The originating family is injected by the view.
    """

    nanny = NannyBriefSerializer(read_only=True)
    nanny_id = serializers.PrimaryKeyRelatedField(
        queryset=Nanny.objects.all(), source="nanny", required=False, write_only=True
    )
    first_name = serializers.CharField(write_only=True, required=False)
    last_name = serializers.CharField(write_only=True, required=False)
    families = serializers.SerializerMethodField()
    current_terms = serializers.SerializerMethodField()
    current_schedule = serializers.SerializerMethodField()

    class Meta:
        model = Contract
        fields = (
            "id",
            "nanny",
            "nanny_id",
            "first_name",
            "last_name",
            "starting_date",
            "ending_date",
            "split_method",
            "paid_leave_days",
            "notes",
            "families",
            "current_terms",
            "current_schedule",
        )
        read_only_fields = ("id",)

    def get_families(self, obj: Contract) -> list[dict]:
        return [
            {"id": s.family_id, "name": s.family.name, "is_originator": s.is_originator}
            for s in obj.shares.all()
        ]

    def _current(self, obj: Contract, relation: str, annotated_attr: str, method: str):
        # Prefer the annotated current-snapshot id (set by ContractQuerySet), read
        # from the prefetched relation to avoid an extra query per contract.
        annotated = getattr(obj, annotated_attr, _MISSING)
        if annotated is _MISSING:
            return getattr(obj, method)()
        if annotated is None:
            return None
        return next((item for item in getattr(obj, relation).all() if item.id == annotated), None)

    def get_current_terms(self, obj: Contract) -> dict | None:
        terms = self._current(obj, "terms", "current_terms_id", "current_terms")
        return ContractTermsSerializer(terms, context=self.context).data if terms else None

    def get_current_schedule(self, obj: Contract) -> dict | None:
        schedule = self._current(obj, "schedules", "current_schedule_id", "current_schedule")
        return ContractScheduleSerializer(schedule, context=self.context).data if schedule else None

    def validate(self, attrs: dict) -> dict:
        starting = attrs.get("starting_date", getattr(self.instance, "starting_date", None))
        ending = attrs.get("ending_date", getattr(self.instance, "ending_date", None))
        if ending is not None and starting is not None and ending < starting:
            raise serializers.ValidationError(
                {"ending_date": _("The ending date cannot be before the starting date.")}
            )
        if self.instance is None:
            nanny = attrs.get("nanny")
            if nanny is None and not (attrs.get("first_name") and attrs.get("last_name")):
                raise serializers.ValidationError(
                    {"nanny_id": _("Provide an existing nanny, or a first and last name.")}
                )
            if nanny is not None:
                family = self.context.get("family")
                if (
                    family is None
                    or not Contract.objects.filter(nanny=nanny, families=family).exists()
                ):
                    raise serializers.ValidationError(
                        {"nanny_id": _("This nanny is not linked to your family.")}
                    )
        return attrs

    def create(self, validated_data: dict) -> Contract:
        nanny = validated_data.pop("nanny", None)
        first_name = validated_data.pop("first_name", None)
        last_name = validated_data.pop("last_name", None)
        if nanny is None:
            nanny = Nanny.objects.create(
                first_name=first_name,
                last_name=last_name,
                created_by=self.context["request"].user,
            )
        return Contract.objects.create(nanny=nanny, **validated_data)

    def update(self, instance: Contract, validated_data: dict) -> Contract:
        # The nanny person is fixed on update; only its name is editable here.
        validated_data.pop("nanny", None)
        first_name = validated_data.pop("first_name", None)
        last_name = validated_data.pop("last_name", None)
        if first_name is not None:
            instance.nanny.first_name = first_name
        if last_name is not None:
            instance.nanny.last_name = last_name
        if first_name is not None or last_name is not None:
            instance.nanny.save()
        return super().update(instance, validated_data)


class PaidLeaveBalanceSerializer(serializers.Serializer):
    """A contract's congés-payés standing for the current reference period.

    Not a model: the balance is computed on the fly by :mod:`tracking.paid_leave`.
    Days are decimals (a half-day is 0.5) and ``remaining`` may be negative when
    leave is booked ahead of what has accrued so far.
    """

    period_start = serializers.DateField(read_only=True)
    period_end = serializers.DateField(read_only=True)
    total_days = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    accrued = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    taken = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    remaining = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)


class ContractInvitationSerializer(serializers.ModelSerializer):
    """Create/list invitations to share a contract. Token is exposed to the
    managing family so they can build the invite link (no email backend yet)."""

    class Meta:
        model = ContractInvitation
        fields = ("id", "email", "status", "token", "created_at", "expires_at")
        read_only_fields = ("id", "status", "token", "created_at", "expires_at")

    def validate_email(self, value: str) -> str:
        return value.lower()

    def validate(self, attrs: dict) -> dict:
        contract = self.context["contract"]
        if ContractInvitation.objects.filter(
            contract=contract,
            email=attrs["email"],
            status=ContractInvitation.Status.PENDING,
        ).exists():
            raise serializers.ValidationError(
                _("A pending invitation for this email already exists.")
            )
        return attrs

    def create(self, validated_data: dict) -> ContractInvitation:
        return ContractInvitation.objects.create(
            contract=self.context["contract"],
            invited_by=self.context["request"].user,
            **validated_data,
        )


class ContractInvitationPreviewSerializer(serializers.ModelSerializer):
    """Public, token-addressed view shown on the invite landing page."""

    nanny_first_name = serializers.CharField(source="contract.nanny.first_name", read_only=True)
    nanny_last_name = serializers.CharField(source="contract.nanny.last_name", read_only=True)

    class Meta:
        model = ContractInvitation
        fields = ("email", "status", "nanny_first_name", "nanny_last_name", "expires_at")
        read_only_fields = fields


class MyContractInvitationSerializer(serializers.ModelSerializer):
    """A pending contract invitation addressed to the requesting user (inbox)."""

    nanny_first_name = serializers.CharField(source="contract.nanny.first_name", read_only=True)
    nanny_last_name = serializers.CharField(source="contract.nanny.last_name", read_only=True)

    class Meta:
        model = ContractInvitation
        fields = ("id", "nanny_first_name", "nanny_last_name", "token", "expires_at")
        read_only_fields = fields


class SourceSerializer(serializers.Serializer):
    """A citation: what the rule is called, where it lives, and what it says."""

    ref = serializers.CharField(read_only=True)
    url = serializers.URLField(read_only=True)
    quote = serializers.CharField(read_only=True)


class ContractChildWindowSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContractChildWindow
        fields = ("id", "weekday", "start_time", "end_time")
        read_only_fields = ("id",)

    def validate(self, attrs: dict) -> dict:
        if attrs["end_time"] <= attrs["start_time"]:
            raise serializers.ValidationError(
                {"end_time": _("The end time must be after the start time.")}
            )
        return attrs


class ContractChildSerializer(serializers.ModelSerializer):
    """A child on the contract and the hours they are actually there.

    ``windows`` is nested and written whole, like a schedule's blocks. Sending an
    empty list is not "leave it alone" — it means the child is there whenever the
    nanny is, which is the common case and the default.
    """

    windows = ContractChildWindowSerializer(many=True, required=False)
    first_name = serializers.CharField(source="child.first_name", read_only=True)
    family_id = serializers.UUIDField(source="child.family_id", read_only=True)

    class Meta:
        model = ContractChild
        fields = ("id", "child", "first_name", "family_id", "windows")
        read_only_fields = ("id", "first_name", "family_id")

    def validate_child(self, child):
        contract = self.context["contract"]
        if not contract.shares.filter(family_id=child.family_id).exists():
            # Otherwise their hours route to a family that never employed the
            # nanny, and the child's name surfaces in that family's declaration.
            raise serializers.ValidationError(
                _("This child's family does not share this contract.")
            )
        return child

    def validate_windows(self, windows: list[dict]) -> list[dict]:
        # Overlapping windows on one day are deliberately allowed: their union is
        # what counts. Only the ordering within a window is a mistake.
        return windows

    def create(self, validated_data: dict) -> ContractChild:
        windows = validated_data.pop("windows", [])
        link = ContractChild.objects.create(**validated_data)
        self._write_windows(link, windows)
        return link

    def update(self, instance: ContractChild, validated_data: dict) -> ContractChild:
        windows = validated_data.pop("windows", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if windows is not None:
            instance.windows.all().delete()
            self._write_windows(instance, windows)
        return instance

    @staticmethod
    def _write_windows(link: ContractChild, windows: list[dict]) -> None:
        ContractChildWindow.objects.bulk_create(
            ContractChildWindow(contract_child=link, **window) for window in windows
        )


class ExceptionalHoursSerializer(serializers.ModelSerializer):
    """Hours beyond the schedule, filed by one family and read by all of them.

    ``family`` is never accepted from the payload — the viewset pins it to the
    acting family. A family may read the other's filings (its own hours depend on
    them) and must never write them.
    """

    class Meta:
        model = ExceptionalHours
        fields = (
            "id",
            "family",
            "kind",
            "is_shared",
            "start_date",
            "start_time",
            "end_date",
            "end_time",
            "interventions",
            "notes",
        )
        read_only_fields = ("id", "family")

    def validate(self, attrs: dict) -> dict:
        def resolved(field: str):
            if field in attrs:
                return attrs[field]
            return getattr(self.instance, field, None)

        # Validate the resulting state, not the delta: a PATCH that moves only the
        # end time must still be checked against the start it will end up with.
        instance = ExceptionalHours(
            contract=self.context["contract"],
            family=self.context["family"],
            kind=resolved("kind") or ExceptionalHours.Kind.EFFECTIVE,
            is_shared=bool(resolved("is_shared")),
            start_date=resolved("start_date"),
            start_time=resolved("start_time"),
            end_date=resolved("end_date"),
            end_time=resolved("end_time"),
            interventions=resolved("interventions") or 0,
        )
        try:
            instance.clean()
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.message_dict) from error

        if _overlaps_schedule(instance):
            # Scheduled hours are already paid through the mensualisation, so
            # counting them again pays them twice. A child present outside their
            # *window* but inside the schedule is a different thing entirely —
            # that is an ExceptionalPresence.
            raise serializers.ValidationError(
                {
                    "start_time": _(
                        "These hours overlap the planning. Exceptional hours are the ones "
                        "worked beyond it."
                    )
                }
            )
        return attrs


def _overlaps_schedule(entry: ExceptionalHours) -> bool:
    """Does an exceptional entry collide with the week the nanny already works?"""
    for day in (entry.start_date, entry.end_date):
        schedule = entry.contract.current_schedule(day)
        if schedule is None:
            continue
        start = entry.start_time if day == entry.start_date else time(0, 0)
        end = entry.end_time if day == entry.end_date else time(23, 59)
        for block in schedule.blocks.filter(weekday=day.weekday()):
            if start < block.end_time and block.start_time < end:
                return True
    return False


class ExceptionalPresenceSerializer(serializers.ModelSerializer):
    """A child present on one date outside their usual window.

    The nanny works no longer for it; only the split moves. Contrast
    ExceptionalHours, which lengthens her day.
    """

    first_name = serializers.CharField(source="child.first_name", read_only=True)

    class Meta:
        model = ExceptionalPresence
        fields = ("id", "child", "first_name", "date", "start_time", "end_time", "notes")
        read_only_fields = ("id", "first_name")

    def validate(self, attrs: dict) -> dict:
        instance = ExceptionalPresence(
            contract=self.context["contract"],
            child=attrs.get("child") or getattr(self.instance, "child", None),
            date=attrs.get("date") or getattr(self.instance, "date", None),
            start_time=attrs.get("start_time") or getattr(self.instance, "start_time", None),
            end_time=attrs.get("end_time") or getattr(self.instance, "end_time", None),
        )
        try:
            instance.clean()
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.message_dict) from error
        return attrs


class MonthlyDeclarationSerializer(serializers.ModelSerializer):
    """The five numbers pajemploi asks for, and where they came from.

    Almost everything is read-only: it is computed, not typed. ``kilometers`` is
    the exception — mileage_rate's missing operand, which only a parent knows.
    """

    warnings = serializers.SerializerMethodField()
    family_name = serializers.CharField(source="family.name", read_only=True)
    # Model properties, not columns: a filed row stays editable in place until the
    # end of its grace window, after which it locks. The UI shows the kilometres
    # control and the deadline off these rather than off status alone.
    is_editable = serializers.BooleanField(read_only=True)
    editable_until = serializers.DateField(read_only=True)

    class Meta:
        model = MonthlyDeclaration
        fields = (
            "id",
            "family",
            "family_name",
            "month",
            "status",
            "normal_hours",
            "hours_25",
            "hours_50",
            "net_salary",
            "total_amount",
            "transport_amount",
            "benefits_in_kind_amount",
            "kilometers",
            "mileage_amount",
            "night_count",
            "night_indemnity",
            "holiday_majoration",
            "net_hourly_rate",
            "night_presence_rate",
            "mileage_rate",
            "rate_periods",
            "warnings",
            "computed_at",
            "filed_at",
            "is_editable",
            "editable_until",
        )
        read_only_fields = tuple(f for f in fields if f != "kilometers")

    def get_warnings(self, obj: MonthlyDeclaration) -> list[dict]:
        """Each warning with the rule behind it, so the UI can show its source.

        A bare code makes a parent take our word for a number they are about to
        file. The quote and the URL are what let them check it.
        """
        out = []
        for code in obj.warnings or []:
            source = source_for(code)
            out.append({"code": code, "source": SourceSerializer(source).data if source else None})
        return out
