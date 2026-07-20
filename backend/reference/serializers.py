from rest_framework import serializers

from .models import BankHoliday


class BankHolidaySerializer(serializers.ModelSerializer):
    """A national work-free day. Read-only over the API (admin-managed)."""

    class Meta:
        model = BankHoliday
        fields = ("id", "name", "date", "is_workable")
        read_only_fields = ("id",)
