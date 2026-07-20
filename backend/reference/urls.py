from django.urls import path

from . import views

app_name = "reference"

urlpatterns = [
    path("minimum-wage/", views.MinimumWageView.as_view(), name="minimum-wage"),
    # National work-free days (jours fériés), global and admin-managed.
    path("holidays/", views.BankHolidayListView.as_view(), name="bank-holidays"),
]
