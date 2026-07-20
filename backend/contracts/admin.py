from django.contrib import admin

from .models import (
    Contract,
    ContractChild,
    ContractChildWindow,
    ContractInvitation,
    ContractSchedule,
    ContractShare,
    ContractTerms,
    ExceptionalHours,
    ExceptionalPresence,
    Leave,
    MonthlyDeclaration,
    ScheduleBlock,
)


class ContractShareInline(admin.TabularInline):
    model = ContractShare
    extra = 0


class ContractTermsInline(admin.TabularInline):
    model = ContractTerms
    extra = 0


class ScheduleBlockInline(admin.TabularInline):
    model = ScheduleBlock
    extra = 0


class ContractChildInline(admin.TabularInline):
    model = ContractChild
    extra = 0


class ContractChildWindowInline(admin.TabularInline):
    model = ContractChildWindow
    extra = 0


@admin.register(Contract)
class ContractAdmin(admin.ModelAdmin):
    list_display = ("nanny", "starting_date", "ending_date", "created_by")
    search_fields = ("nanny__first_name", "nanny__last_name")
    list_filter = ("split_method", "starting_date", "ending_date")
    inlines = (ContractShareInline, ContractChildInline, ContractTermsInline)


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


@admin.register(ContractChild)
class ContractChildAdmin(admin.ModelAdmin):
    list_display = ("contract", "child")
    inlines = (ContractChildWindowInline,)


@admin.register(ExceptionalHours)
class ExceptionalHoursAdmin(admin.ModelAdmin):
    list_display = ("contract", "family", "kind", "start_date", "start_time", "end_time")
    list_filter = ("kind", "start_date")


@admin.register(ExceptionalPresence)
class ExceptionalPresenceAdmin(admin.ModelAdmin):
    list_display = ("contract", "child", "date", "start_time", "end_time")
    list_filter = ("date",)


@admin.register(MonthlyDeclaration)
class MonthlyDeclarationAdmin(admin.ModelAdmin):
    list_display = ("contract", "family", "month", "status", "normal_hours", "total_amount")
    list_filter = ("status", "month")
    # A filed declaration is the record of what was sent to pajemploi. Editing it
    # here would rewrite history and, worse, look authoritative afterwards.
    readonly_fields = ("computed_at", "filed_at", "filed_by", "rate_periods", "warnings")
