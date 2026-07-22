from rest_framework import serializers

from children.models import Child


class ChildSerializer(serializers.ModelSerializer):
    """A child of a family; the family is taken from the URL, not the payload."""

    class Meta:
        model = Child
        fields = ("id", "first_name")
