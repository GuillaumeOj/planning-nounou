from django.contrib import admin

from children.models import Child


@admin.register(Child)
class ChildAdmin(admin.ModelAdmin):
    """Admin listing of children and their family."""

    list_display = ("first_name", "family")
    search_fields = ("first_name", "family__name")
