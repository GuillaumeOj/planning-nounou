from rest_framework import serializers

from reference.models import BankHoliday


class MinimumWageSerializer(serializers.Serializer):
    """Response shape for the minimum-wage lookup: the recommended net hourly rate
    (a DRF decimal string) in force on the requested date, or null if none applies."""

    net_hourly_rate = serializers.CharField(allow_null=True)


class PaidLeaveAllowanceSerializer(serializers.Serializer):
    """Response shape for the paid-leave-default lookup: the default annual paid-leave
    days in force on the requested date, or null if none is seeded."""

    annual_days = serializers.IntegerField(allow_null=True)


class BankHolidaySerializer(serializers.ModelSerializer):
    """A national work-free day. Read-only over the API (admin-managed)."""

    class Meta:
        model = BankHoliday
        fields = ("id", "name", "date", "is_workable")
        read_only_fields = ("id",)
