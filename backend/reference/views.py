from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import generics, permissions
from rest_framework.request import Request
from rest_framework.response import Response

from reference.models import BankHoliday, MinimumWage, PaidLeaveAllowance
from reference.serializers import BankHolidaySerializer


def _on_from_query(request: Request):
    """The ``?on=YYYY-MM-DD`` date the client asked about, or today if absent/unparseable."""
    raw = request.query_params.get("on")
    return (parse_date(raw) if raw else None) or timezone.localdate()


class MinimumWageView(generics.GenericAPIView):
    """The recommended net-hourly minimum in force on a given date (?on=YYYY-MM-DD,
    default today). Lets the client warn when a rate is below the minimum for the
    *effective* date it is entered for."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        rate = MinimumWage.applicable_on(_on_from_query(request))
        return Response({"net_hourly_rate": f"{rate:.2f}" if rate is not None else None})


class PaidLeaveAllowanceView(generics.GenericAPIView):
    """The default annual paid-leave days in force on a given date (?on=YYYY-MM-DD,
    default today). The contract form pre-fills its ``paid_leave_days`` from it."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        return Response({"annual_days": PaidLeaveAllowance.applicable_on(_on_from_query(request))})


class BankHolidayListView(generics.ListAPIView):
    """The national work-free days (jours fériés), optionally filtered by ``?year=``.

    Global and admin-managed: read-only over the API. The planning uses these to
    label days and drop the nannies' working blocks on non-workable holidays.
    """

    serializer_class = BankHolidaySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = BankHoliday.objects.all()
        year = self.request.query_params.get("year")
        if year and year.isdigit():
            queryset = queryset.filter(date__year=int(year))
        return queryset
