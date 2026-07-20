from django.contrib import admin

from .models import Nanny


@admin.register(Nanny)
class NannyAdmin(admin.ModelAdmin):
    list_display = ("first_name", "last_name", "created_by")
    search_fields = ("first_name", "last_name")
