from datetime import date, datetime
from typing import cast

from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.translation import gettext_lazy as _
from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import BaseSerializer

from accounts.models import Family, User
from accounts.views import FamilyScopedMixin

from .declarations_repo import declarations_for, file_declaration
from .models import (
    BankHoliday,
    Contract,
    ContractInvitation,
    ContractShare,
    MinimumWage,
    MonthlyDeclaration,
)
from .serializers import (
    BankHolidaySerializer,
    ContractChildSerializer,
    ContractInvitationPreviewSerializer,
    ContractInvitationSerializer,
    ContractScheduleSerializer,
    ContractSerializer,
    ContractTermsSerializer,
    ExceptionalHoursSerializer,
    ExceptionalPresenceSerializer,
    LeaveSerializer,
    MonthlyDeclarationSerializer,
    MyContractInvitationSerializer,
)


@api_view(["GET"])
@permission_classes([AllowAny])
def health(_request: Request) -> Response:
    """Liveness probe used by deploy health checks. Public — no auth required."""
    return Response({"status": "ok"})


class MinimumWageView(generics.GenericAPIView):
    """The recommended net-hourly minimum in force on a given date (?on=YYYY-MM-DD,
    default today). Lets the client warn when a rate is below the minimum for the
    *effective* date it is entered for."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request) -> Response:
        raw = request.query_params.get("on")
        on = (parse_date(raw) if raw else None) or timezone.localdate()
        rate = MinimumWage.applicable_on(on)
        return Response({"net_hourly_rate": f"{rate:.2f}" if rate is not None else None})


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


_WRITE_ACTIONS = ("create", "update", "partial_update", "destroy")


class ContractScopedMixin(FamilyScopedMixin):
    """Resolve a contract from the URL, scoped to the acting family (family_pk).

    Reads only need the acting family to *access* the contract; writes need it to
    *manage* (own) it — so shared terms can only be edited by an owner of a
    participating family.
    """

    def get_contract(self, *, manage: bool = False) -> Contract:
        family = self.get_family(manage=manage)
        return get_object_or_404(Contract, pk=self.kwargs["contract_pk"], families=family)


class ContractViewSet(FamilyScopedMixin, viewsets.ModelViewSet):
    """CRUD for the contracts shared with the acting family.

    Reads require family access; writes (financial/schedule data) require manage
    rights on the acting family.
    """

    serializer_class = ContractSerializer
    permission_classes = [permissions.IsAuthenticated]

    def _manage(self) -> bool:
        return self.action in _WRITE_ACTIONS

    def get_queryset(self):
        family = self.get_family(manage=self._manage())
        base = (
            Contract.objects.filter(families=family)
            .select_related("nanny")
            .prefetch_related("shares__family", "terms", "schedules__blocks")
        )
        # as_manager() loses the ContractQuerySet type through chaining.
        return base.with_current_terms().with_current_schedule()  # ty: ignore[unresolved-attribute]

    def get_serializer_context(self) -> dict:
        # The serializer scopes an existing nanny_id to the acting family.
        return {
            **super().get_serializer_context(),
            "family": self.get_family(manage=self._manage()),
        }

    def perform_create(self, serializer: BaseSerializer) -> None:
        family = self.get_family(manage=True)
        contract = serializer.save()
        ContractShare.objects.create(contract=contract, family=family, is_originator=True)


class ContractTermsViewSet(
    ContractScopedMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """History + create-a-new-version, plus edit/delete a snapshot to fix errors."""

    serializer_class = ContractTermsSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return self.get_contract(manage=self.action in _WRITE_ACTIONS).terms.all()

    def perform_create(self, serializer: BaseSerializer) -> None:
        contract = self.get_contract(manage=True)
        effective_from = serializer.validated_data.get("effective_from") or timezone.localdate()
        # Same-day repost corrects that day's snapshot; a new day appends history.
        existing = contract.terms.filter(effective_from=effective_from).first()
        serializer.instance = existing
        serializer.save(
            contract=contract, effective_from=effective_from, edited=existing is not None
        )

    def perform_update(self, serializer: BaseSerializer) -> None:
        serializer.save(edited=True)


class ContractScheduleViewSet(
    ContractScopedMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """History + create-a-new-version, plus edit/delete a snapshot to fix errors."""

    serializer_class = ContractScheduleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        manage = self.action in _WRITE_ACTIONS
        return self.get_contract(manage=manage).schedules.prefetch_related("blocks")

    def perform_create(self, serializer: BaseSerializer) -> None:
        contract = self.get_contract(manage=True)
        effective_from = serializer.validated_data.get("effective_from") or timezone.localdate()
        # Replace any same-day snapshot (a correction) then write the new one.
        deleted, _ = contract.schedules.filter(effective_from=effective_from).delete()
        serializer.save(contract=contract, effective_from=effective_from, edited=deleted > 0)

    def perform_update(self, serializer: BaseSerializer) -> None:
        serializer.save(edited=True)


class LeaveViewSet(
    ContractScopedMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Flat CRUD for a contract's days off. Reads need access, writes need manage."""

    serializer_class = LeaveSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return self.get_contract(manage=self.action in _WRITE_ACTIONS).leaves.all()

    def perform_create(self, serializer: BaseSerializer) -> None:
        contract = self.get_contract(manage=True)
        serializer.save(contract=contract, created_by=self.request.user)


class ContractInvitationViewSet(
    ContractScopedMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Manage invitations to share a contract. All actions require manage rights."""

    serializer_class = ContractInvitationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return self.get_contract(manage=True).invitations.all()

    def get_serializer_context(self) -> dict:
        return {**super().get_serializer_context(), "contract": self.get_contract(manage=True)}

    def perform_destroy(self, instance: ContractInvitation) -> None:
        """Revoke rather than hard-delete, keeping an audit trail."""
        instance.status = ContractInvitation.Status.REVOKED
        instance.save(update_fields=["status"])


class MyContractInvitationsView(generics.ListAPIView):
    """Pending contract invitations addressed to the requesting user's email."""

    serializer_class = MyContractInvitationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = cast(User, self.request.user)
        return ContractInvitation.objects.filter(
            email__iexact=user.email,
            status=ContractInvitation.Status.PENDING,
            expires_at__gt=timezone.now(),
        ).select_related("contract__nanny")


class ContractInvitationPreviewView(generics.RetrieveAPIView):
    """Public, token-addressed preview for the invite landing page."""

    serializer_class = ContractInvitationPreviewSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = "token"
    queryset = ContractInvitation.objects.select_related("contract__nanny")


def _get_actionable_invitation(token: str) -> ContractInvitation:
    invitation = get_object_or_404(ContractInvitation, token=token)
    if not invitation.is_actionable:
        raise ValidationError("This invitation has expired or was already used.")
    return invitation


class ContractInvitationAcceptView(generics.GenericAPIView):
    """Accept a contract invitation, attaching a family the user owns."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request, token: str) -> Response:
        invitation = _get_actionable_invitation(token)
        family_id = request.data.get("family_id")
        if not family_id:
            raise ValidationError({"family_id": "Choose which family joins the contract."})
        family = get_object_or_404(Family, pk=family_id)
        if not family.can_manage(request.user):
            raise PermissionDenied("You can only attach a family you own.")
        invitation.accept(family)
        return Response(ContractSerializer(invitation.contract, context={"request": request}).data)


class ContractInvitationDeclineView(generics.GenericAPIView):
    """Decline a contract invitation as the logged-in user."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request, token: str) -> Response:
        invitation = _get_actionable_invitation(token)
        invitation.decline()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FamilyScopedWriteMixin(ContractScopedMixin):
    """Read every family's rows on the contract; write only the acting family's.

    A shape nothing else in this codebase has, and the reason LeaveViewSet must
    not simply be copied. Family A's declared hours depend on whether B filed an
    overlapping entry, so A has to *read* B's rows — but letting A *edit* them
    would let one employer rewrite the other's declaration.

    ContractScopedMixin only ever checks the contract. That is enough for a Leave,
    which belongs to the nanny and is contract-wide for both reads and writes. It
    is not enough here.
    """

    def get_acting_family(self) -> Family:
        return self.get_family(manage=True)

    def check_owned(self, instance) -> None:
        if instance.family_id != self.get_acting_family().id:
            raise PermissionDenied(_("This entry belongs to another family."))

    def perform_update(self, serializer: BaseSerializer) -> None:
        self.check_owned(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance) -> None:
        self.check_owned(instance)
        instance.delete()


class ContractChildViewSet(
    ContractScopedMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Which children a contract covers, and the hours they are there.

    Contract-wide for reads and writes, like the schedule it describes: the
    families agree the arrangement jointly, and one family's windows change the
    other's declared hours.
    """

    serializer_class = ContractChildSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        contract = self.get_contract(manage=self.action in _WRITE_ACTIONS)
        return contract.contract_children.select_related("child").prefetch_related("windows")

    def get_serializer_context(self) -> dict:
        return {
            **super().get_serializer_context(),
            "contract": self.get_contract(manage=self.action in _WRITE_ACTIONS),
        }

    def perform_create(self, serializer: BaseSerializer) -> None:
        serializer.save(contract=self.get_contract(manage=True))


class ExceptionalHoursViewSet(
    FamilyScopedWriteMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Hours worked beyond the planning. Read every family's, write your own."""

    serializer_class = ExceptionalHoursSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Deliberately unfiltered by family: the acting family's own numbers
        # depend on what the others filed, so it must see them.
        return self.get_contract(
            manage=self.action in _WRITE_ACTIONS
        ).exceptional_hours.select_related("family")

    def get_serializer_context(self) -> dict:
        manage = self.action in _WRITE_ACTIONS
        context = {**super().get_serializer_context(), "contract": self.get_contract(manage=manage)}
        if manage:
            context["family"] = self.get_acting_family()
        return context

    def perform_create(self, serializer: BaseSerializer) -> None:
        # family is pinned here, never taken from the payload.
        serializer.save(
            contract=self.get_contract(manage=True),
            family=self.get_acting_family(),
            created_by=self.request.user,
        )


class ExceptionalPresenceViewSet(
    ContractScopedMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """A child there outside their usual window. Contract-wide: it moves the split
    between the families, so it is not one family's to hide."""

    serializer_class = ExceptionalPresenceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return self.get_contract(
            manage=self.action in _WRITE_ACTIONS
        ).exceptional_presences.select_related("child")

    def get_serializer_context(self) -> dict:
        return {
            **super().get_serializer_context(),
            "contract": self.get_contract(manage=self.action in _WRITE_ACTIONS),
        }

    def perform_create(self, serializer: BaseSerializer) -> None:
        serializer.save(contract=self.get_contract(manage=True), created_by=self.request.user)


class MonthlyDeclarationViewSet(
    FamilyScopedWriteMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """What each family declares to pajemploi for a month.

    Listing recomputes every family's draft from live data, so a schedule edited
    yesterday shows up rather than lurking. A filed declaration is the record of
    what was actually sent and is returned untouched.

    Read every family's — a parent wants to see the whole arrangement adds up —
    but write only your own, and only `kilometers`: everything else is computed.
    """

    serializer_class = MonthlyDeclarationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def _month(self) -> date:
        raw = self.request.query_params.get("month")
        if not raw:
            return timezone.localdate().replace(day=1)
        try:
            return datetime.strptime(raw, "%Y-%m").date().replace(day=1)
        except ValueError:
            raise ValidationError({"month": _("Give a month as YYYY-MM.")}) from None

    def get_queryset(self):
        contract = self.get_contract(manage=self.action in _WRITE_ACTIONS)
        if self.action == "list":
            declarations_for(contract, self._month())
        return contract.declarations.select_related("family")

    def filter_queryset(self, queryset):
        if self.action == "list":
            return queryset.filter(month=self._month())
        return queryset

    def perform_update(self, serializer: BaseSerializer) -> None:
        declaration = cast("MonthlyDeclaration", serializer.instance)
        self.check_owned(declaration)
        if declaration.is_frozen:
            raise ValidationError(
                {"status": _("A filed declaration cannot be changed. Nothing may rewrite it.")}
            )
        serializer.save()
        # Kilometres feed the mileage, so the row is stale the moment they change.
        declarations_for(declaration.contract, declaration.month)
        declaration.refresh_from_db()

    @action(detail=True, methods=["post"])
    def file(self, request, **kwargs):
        """Freeze this declaration as sent to pajemploi. Idempotent."""
        declaration = self.get_object()
        self.check_owned(declaration)
        file_declaration(declaration, request.user)
        return Response(self.get_serializer(declaration).data)
