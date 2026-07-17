from datetime import date, datetime
from typing import cast

from django.db.models import Q
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

from .declarations_repo import declarations_for, file_declaration, paid_leave_balance
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
    PaidLeaveBalanceSerializer,
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

    @action(detail=True, methods=["get"], url_path="paid-leave")
    def paid_leave(self, request: Request, **kwargs) -> Response:
        """The nanny's congés-payés balance for the current reference period.

        A read: any family sharing the contract may see it. The figures come from
        the pure paid-leave domain, computed on the fly rather than stored.

        Fetches a plain family-scoped row rather than ``get_object()``: the CRUD
        queryset's current-snapshot annotations and terms/schedule prefetches are
        all work ``paid_leave_balance`` re-queries for itself and never reads here.
        """
        contract = get_object_or_404(
            Contract.objects.filter(families=self.get_family()), pk=self.kwargs["pk"]
        )
        balance = paid_leave_balance(contract)
        return Response(PaidLeaveBalanceSerializer(balance).data)


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


class FamilyPrivateMixin(ContractScopedMixin):
    """Rows that belong to one family on a shared contract, and are private to it.

    The two employers share a nanny, not a payslip. What B pays her, and which
    evenings B kept her late, are B's — so A never reads them, and of course
    never writes them.

    This does *not* mean A's numbers are computed in ignorance of B's. They
    cannot be: the split bands the nanny's whole week before dividing it
    (art. 144.2), so A's overtime depends on hours B filed. That arithmetic
    happens in declarations.py, which reads the database directly and needs no
    permission from anyone. The dependency is real; shipping B's rows to A's
    browser was never what satisfied it.

    ContractScopedMixin only ever checks the *contract*. That is right for a
    Leave — it belongs to the nanny, and both employers must see when she is off
    — and wrong here.

    Scoping the queryset rather than checking ownership on the way out is what
    makes a cross-family read a 404 rather than a 403. A 403 reading "this entry
    belongs to another family" confirms the entry exists, which is the very thing
    being kept private.
    """

    #: Set by ViewSet dispatch; declared so the mixin may read it on its own.
    action: str

    #: Actions that need manage rights on the acting family. Subclasses with a
    #: custom write action (declarations have `file`) extend this.
    write_actions: tuple[str, ...] = _WRITE_ACTIONS

    def _manage(self) -> bool:
        return self.action in self.write_actions

    def get_acting_family(self) -> Family:
        return self.get_family(manage=self._manage())

    def scoped_to_family(self, queryset):
        """The acting family's rows, and no one else's."""
        return queryset.filter(family=self.get_acting_family())


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
    FamilyPrivateMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Hours worked beyond the planning. Your family's own, plus shared care.

    An evening B kept the nanny late for its own child is B's business with her —
    A never sees it. But an evening *both* families needed her is shared: B files
    it, and A must see it to be prompted to file its own half, so shared entries
    cross the family line on read. Writes never do — a family only ever edits or
    deletes its own rows, whatever it can see.

    Either way the hours still lengthen the nanny's week and can push a family into
    overtime; compute_month reads every family's rows to work that out server-side.
    """

    serializer_class = ExceptionalHoursSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        rows = self.get_contract(manage=self._manage()).exceptional_hours.select_related("family")
        if self.action in self.write_actions:
            # Edits and deletes are own-rows-only, whatever is visible on read.
            return self.scoped_to_family(rows)
        # Reads: this family's own, and every family's shared entries — the latter
        # are what the "the other family logged shared care, add yours" prompt is
        # built from. A solo entry of another family stays a 404.
        return rows.filter(Q(family=self.get_acting_family()) | Q(is_shared=True))

    def get_serializer_context(self) -> dict:
        manage = self._manage()
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
    FamilyPrivateMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """What the acting family declares to pajemploi for a month.

    Listing recomputes *every* family's draft from live data — the split is one
    calculation over the nanny's whole month, and B's row would go stale if only
    A's were rebuilt — but returns only the acting family's. What B pays her is
    B's. A filed declaration is the record of what was actually sent and is
    returned untouched.

    Only `kilometers` is writable: everything else is computed.
    """

    serializer_class = MonthlyDeclarationSerializer
    permission_classes = [permissions.IsAuthenticated]
    # Filing is a write, and DRF's default write set does not know the name.
    write_actions = (*_WRITE_ACTIONS, "file")

    def _month(self) -> date:
        raw = self.request.query_params.get("month")
        if not raw:
            return timezone.localdate().replace(day=1)
        try:
            return datetime.strptime(raw, "%Y-%m").date().replace(day=1)
        except ValueError:
            raise ValidationError({"month": _("Give a month as YYYY-MM.")}) from None

    def get_queryset(self):
        contract = self.get_contract(manage=self._manage())
        if self.action == "list":
            # Computes both families' rows; scoped_to_family returns one of them.
            declarations_for(contract, self._month())
        return self.scoped_to_family(contract.declarations.select_related("family"))

    def filter_queryset(self, queryset):
        if self.action == "list":
            return queryset.filter(month=self._month())
        return queryset

    def perform_update(self, serializer: BaseSerializer) -> None:
        declaration = cast("MonthlyDeclaration", serializer.instance)
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
        file_declaration(declaration, request.user)
        return Response(self.get_serializer(declaration).data)
