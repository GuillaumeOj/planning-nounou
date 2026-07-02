from django.contrib import admin

from .models import Nanny


@admin.register(Nanny)
class NannyAdmin(admin.ModelAdmin):
    """Admin for nannies, scoped by owner."""

    list_display = ("first_name", "last_name", "owner", "starting_date", "ending_date")
    list_filter = ("starting_date", "ending_date")
    search_fields = ("first_name", "last_name", "owner__email")
