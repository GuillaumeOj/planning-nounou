"""Object-level permissions for family-scoped resources."""

from rest_framework import permissions
from rest_framework.request import Request
from rest_framework.views import APIView

from .models import Family


class IsFamilyMember(permissions.BasePermission):
    """Grants access to a Family object to its members (and, while the family
    is unclaimed, its creator). Owner-level actions are gated separately."""

    def has_object_permission(self, request: Request, view: APIView, obj: Family) -> bool:
        return obj.can_access(request.user)


class IsFamilyManager(permissions.BasePermission):
    """Grants access to a Family object only to owners (or the creator of an
    unclaimed family). Used for member/invitation management and deletion."""

    def has_object_permission(self, request: Request, view: APIView, obj: Family) -> bool:
        if request.method in permissions.SAFE_METHODS:
            return obj.can_access(request.user)
        return obj.can_manage(request.user)
