from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from .models import Nanny


class NannySerializer(serializers.ModelSerializer):
    """Represents a nanny owned by the requesting user (owner set in the view)."""

    class Meta:
        model = Nanny
        fields = ("id", "first_name", "last_name", "starting_date", "ending_date")
        read_only_fields = ("id",)

    def validate(self, attrs: dict) -> dict:
        # On partial updates, fall back to the instance's current values.
        starting_date = attrs.get("starting_date", getattr(self.instance, "starting_date", None))
        ending_date = attrs.get("ending_date", getattr(self.instance, "ending_date", None))
        if ending_date is not None and starting_date is not None and ending_date < starting_date:
            raise serializers.ValidationError(
                {"ending_date": _("The ending date cannot be before the starting date.")}
            )
        return attrs
