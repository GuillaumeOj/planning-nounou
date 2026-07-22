from typing import cast

from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response

from accounts.models import Family, FamilyMembership, Invitation, User
from accounts.permissions import IsFamilyManager, IsFamilyMember

# Account/session endpoints (register, login, me, email, password, reset,
# activation, logout) are now provided by djoser + SimpleJWT — see accounts/urls.py.
# Only the family/membership/invitation views live in this module.
from accounts.serializers import (
    FamilyMembershipSerializer,
    FamilySerializer,
    InvitationPreviewSerializer,
    InvitationSerializer,
    MyInvitationSerializer,
)


def _is_last_owner(family: Family, membership: FamilyMembership) -> bool:
    return (
        membership.role == FamilyMembership.Role.OWNER
        and family.memberships.filter(role=FamilyMembership.Role.OWNER).count() == 1
    )


class FamilyViewSet(viewsets.ModelViewSet):
    """CRUD for families the user can access.

    Reads and ``leave`` are open to any member; editing and deleting require
    manage rights (owner, or creator of an unclaimed family).
    """

    serializer_class = FamilySerializer
    # Class-level queryset so the OpenAPI generator can derive the UUID pk path-param type;
    # get_queryset below is what actually runs (scoped to the requesting user).
    queryset = Family.objects.all()

    def get_queryset(self):
        # `memberships` feeds the serializer's role/is_claimed; the member User
        # rows are not serialized here, so there is no need to join them.
        return Family.objects.accessible_to(self.request.user).prefetch_related("memberships")

    def get_permissions(self):
        if self.action in ("update", "partial_update", "destroy"):
            return [permissions.IsAuthenticated(), IsFamilyManager()]
        return [permissions.IsAuthenticated(), IsFamilyMember()]

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["post"])
    def leave(self, request: Request, pk: str | None = None) -> Response:
        """Remove yourself from a family. The sole owner cannot leave."""
        family = self.get_object()
        membership = family.memberships.filter(user=request.user).first()
        if membership is None:
            raise ValidationError("You are not a member of this family.")
        if _is_last_owner(family, membership):
            raise ValidationError(
                "You are the only owner. Transfer ownership or delete the family instead."
            )
        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FamilyScopedMixin:
    """Resolve the parent family from the URL and enforce access on it."""

    request: Request
    kwargs: dict

    def get_family(self, *, manage: bool = False) -> Family:
        # A viewset resolves the family in more than one hook per request
        # (e.g. get_queryset and get_serializer_context); cache the lookup and
        # permission check so they run once. Keyed by `manage`, since the two
        # checks differ.
        if not hasattr(self, "_family_cache"):
            self._family_cache: dict[bool, Family] = {}
        cache = self._family_cache
        if manage not in cache:
            family = get_object_or_404(Family, pk=self.kwargs["family_pk"])
            allowed = (
                family.can_manage(self.request.user)
                if manage
                else family.can_access(self.request.user)
            )
            if not allowed:
                raise PermissionDenied
            cache[manage] = family
        return cache[manage]


class FamilyMemberViewSet(
    FamilyScopedMixin,
    mixins.ListModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """List a family's members; owners can remove them."""

    serializer_class = FamilyMembershipSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        manage = self.action == "destroy"
        return FamilyMembership.objects.filter(
            family=self.get_family(manage=manage)
        ).select_related("user")

    def perform_destroy(self, instance: FamilyMembership) -> None:
        if _is_last_owner(instance.family, instance):
            raise ValidationError("Cannot remove the only owner of the family.")
        instance.delete()


class InvitationViewSet(
    FamilyScopedMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Manage a family's invitations. All actions require manage rights."""

    serializer_class = InvitationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Invitation.objects.filter(family=self.get_family(manage=True))

    def get_serializer_context(self) -> dict:
        return {**super().get_serializer_context(), "family": self.get_family(manage=True)}

    def perform_destroy(self, instance: Invitation) -> None:
        """Revoke rather than hard-delete, keeping an audit trail."""
        instance.status = Invitation.Status.REVOKED
        instance.save(update_fields=["status"])


class MyInvitationsView(generics.ListAPIView):
    """Pending invitations addressed to the requesting user's email — the inbox
    that surfaces claims to an already-registered user when they log in."""

    serializer_class = MyInvitationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = cast(User, self.request.user)
        return Invitation.objects.filter(
            email__iexact=user.email,
            status=Invitation.Status.PENDING,
            expires_at__gt=timezone.now(),
        ).select_related("family")


class InvitationPreviewView(generics.RetrieveAPIView):
    """Public, token-addressed preview for the invite landing page."""

    serializer_class = InvitationPreviewSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = "token"
    queryset = Invitation.objects.select_related("family")


def _get_actionable_invitation(token: str) -> Invitation:
    """Fetch a pending, unexpired invitation by token or fail the request."""
    invitation = get_object_or_404(Invitation, token=token)
    if not invitation.is_actionable:
        raise ValidationError("This invitation has expired or was already used.")
    return invitation


class InvitationAcceptView(generics.GenericAPIView):
    """Accept an invitation as the logged-in user, joining the family."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = FamilySerializer

    @extend_schema(request=None, responses=FamilySerializer)
    def post(self, request: Request, token: str) -> Response:
        invitation = _get_actionable_invitation(token)
        invitation.accept(cast(User, request.user))
        return Response(FamilySerializer(invitation.family, context={"request": request}).data)


class InvitationDeclineView(generics.GenericAPIView):
    """Decline an invitation as the logged-in user."""

    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses={204: None})
    def post(self, request: Request, token: str) -> Response:
        invitation = _get_actionable_invitation(token)
        invitation.decline()
        return Response(status=status.HTTP_204_NO_CONTENT)
