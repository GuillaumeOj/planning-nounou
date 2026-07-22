from django.contrib import admin

from reference.models import BankHoliday, MinimumWage


@admin.register(MinimumWage)
class MinimumWageAdmin(admin.ModelAdmin):
    list_display = ("effective_from", "net_hourly_rate")


@admin.register(BankHoliday)
class BankHolidayAdmin(admin.ModelAdmin):
    list_display = ("name", "date", "is_workable")
    list_filter = ("is_workable",)
    search_fields = ("name",)
    ordering = ("date",)
