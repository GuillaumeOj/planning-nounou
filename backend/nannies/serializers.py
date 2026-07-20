from rest_framework import serializers

from .models import Nanny


class NannyBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Nanny
        fields = ("id", "first_name", "last_name")
        read_only_fields = fields
