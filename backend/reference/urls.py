from django.urls import path

from reference import views

app_name = "reference"

urlpatterns = [
    path("minimum-wage/", views.MinimumWageView.as_view(), name="minimum-wage"),
    # Default annual paid-leave days a new contract pre-fills from.
    path(
        "paid-leave-default/",
        views.PaidLeaveAllowanceView.as_view(),
        name="paid-leave-default",
    ),
    # National work-free days (jours fériés), global and admin-managed.
    path("holidays/", views.BankHolidayListView.as_view(), name="bank-holidays"),
]
