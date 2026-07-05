from django.contrib import admin

from .models import (
    BankHoliday,
    Contract,
    ContractInvitation,
    ContractSchedule,
    ContractShare,
    ContractTerms,
    Leave,
    MinimumWage,
    Nanny,
    ScheduleBlock,
)


@admin.register(Nanny)
class NannyAdmin(admin.ModelAdmin):
    list_display = ("first_name", "last_name", "created_by")
    search_fields = ("first_name", "last_name")


class ContractShareInline(admin.TabularInline):
    model = ContractShare
    extra = 0


class ContractTermsInline(admin.TabularInline):
    model = ContractTerms
    extra = 0


class ScheduleBlockInline(admin.TabularInline):
    model = ScheduleBlock
    extra = 0


@admin.register(Contract)
class ContractAdmin(admin.ModelAdmin):
    list_display = ("nanny", "starting_date", "ending_date", "created_by")
    list_filter = ("starting_date", "ending_date")
    search_fields = ("nanny__first_name", "nanny__last_name")
    inlines = (ContractShareInline, ContractTermsInline)


@admin.register(ContractSchedule)
class ContractScheduleAdmin(admin.ModelAdmin):
    list_display = ("contract", "effective_from")
    list_filter = ("effective_from",)
    inlines = (ScheduleBlockInline,)


@admin.register(ContractTerms)
class ContractTermsAdmin(admin.ModelAdmin):
    list_display = ("contract", "effective_from", "net_hourly_rate")
    list_filter = ("effective_from",)


@admin.register(ContractInvitation)
class ContractInvitationAdmin(admin.ModelAdmin):
    list_display = ("email", "contract", "status", "created_at", "expires_at")
    list_filter = ("status",)
    search_fields = ("email",)


@admin.register(Leave)
class LeaveAdmin(admin.ModelAdmin):
    list_display = ("contract", "leave_type", "start_date", "end_date", "portion")
    list_filter = ("leave_type", "portion")


@admin.register(MinimumWage)
class MinimumWageAdmin(admin.ModelAdmin):
    list_display = ("effective_from", "net_hourly_rate")


@admin.register(BankHoliday)
class BankHolidayAdmin(admin.ModelAdmin):
    list_display = ("name", "date", "is_workable")
    list_filter = ("is_workable",)
    search_fields = ("name",)
    ordering = ("date",)
